import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { validateBundle } from "@rnav/publication";
import pg from "pg";
import { createApp } from "../../server/app.js";
import { runMigrations } from "../../server/db/runMigrations.js";
import { createAuthMiddleware, createPostgresAuthRepository } from "../../server/middleware/auth.js";
import { createAuthRouter } from "../../server/routes/auth.js";
import { createMediaRouter } from "../../server/routes/media.js";
import { createProfileRouter } from "../../server/routes/profile.js";
import { createUsersRouter } from "../../server/routes/users.js";
import { profileUpdateSchema } from "../../server/services/account/profileSchemas.js";
import { createProfileService } from "../../server/services/account/profileService.js";
import { createMediaService } from "../../server/services/media/mediaService.js";
import { preparePublication } from "../../server/services/public-site/publication.js";
import { createPostgresPublicSiteRepository } from "../../server/services/public-site/postgres-repository.js";
import { createLocalStorage } from "../../server/services/storage/provider.js";
import { createUserAdminService } from "../../server/services/user-admin/userAdminService.js";

const name = `rnav-member-smoke-${randomUUID().slice(0, 8)}`;
const scratch = await mkdtemp(join(tmpdir(), "rnav-member-smoke-"));
const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const password = "only-for-isolated-rehearsal";
let started = false;
let pool: pg.Pool | undefined;
let listener: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;

try {
  docker("run", "-d", "--name", name, "--tmpfs", "/var/lib/postgresql/data", "-e", `POSTGRES_PASSWORD=${password}`,
    "-p", "127.0.0.1::5432", "postgres:14-bookworm");
  started = true;
  const port = docker("port", name, "5432/tcp").split(":").at(-1);
  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  const database = pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
  for (let attempt = 0; ; attempt++) {
    try { await database.query("SELECT 1"); break; }
    catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  const migrations = new URL("../../server/db/migrations/", import.meta.url);
  const previous = join(scratch, "previous");
  await cp(migrations, previous, { recursive: true });
  for (const file of await readdir(previous)) {
    if (Number(file.slice(0, 3)) > 46) await rm(join(previous, file));
  }
  await runMigrations(databaseUrl, { migrationDirectoryUrl: pathToFileURL(previous + "/") });

  const admin = randomUUID(), member = randomUUID(), teacher = randomUUID(), legacy = randomUUID();
  const hash = await bcrypt.hash(password, 10);
  await database.query(`INSERT INTO users(id,username,display_name,email,password_hash,base_tier,account_kind)
    VALUES($1,'admin','Admin',NULL,$5,'super','system'),($2,'zhangsan','张三','login-only@example.test',$5,'normal','person'),
    ($3,'lisi','李四',NULL,$5,'normal','person'),($4,'old-system','Old system',NULL,$5,'super','system')`, [admin, member, teacher, legacy, hash]);
  await database.query(`INSERT INTO user_profiles(user_id,name_zh,name_en,member_slug,degree_level,public_visible,public_fields)
    VALUES($1,'Admin','','admin','',false,'{}'),($2,'张三','San-Zhang','zhangsan','phd',true,ARRAY['name_zh','academic_stage']),
    ($3,'李四','Si-Li','lisi','postdoc',true,ARRAY['name_zh','academic_stage']),($4,'Old','','old-system','',false,'{}')`, [admin, member, teacher, legacy]);
  await database.query("INSERT INTO session_tokens(user_id,token_hash,expires_at) VALUES($1,'legacy-session',now()+interval '1 day')", [legacy]);
  await database.query("INSERT INTO user_permission_overrides(user_id,permission_key,decision,changed_by) VALUES($1,'users.write','grant',$2)", [member, admin]);

  await runMigrations(databaseUrl);
  await runMigrations(databaseUrl);
  assert.equal((await database.query("SELECT status FROM users WHERE id=$1", [legacy])).rows[0].status, "disabled");
  assert.equal((await database.query("SELECT count(*)::int count FROM session_tokens WHERE user_id=$1", [legacy])).rows[0].count, 0);
  assert.equal((await database.query("SELECT count(*)::int count FROM user_permission_overrides WHERE user_id=$1", [member])).rows[0].count, 1);
  const profiles = createProfileService(database);
  const storage = createLocalStorage(join(scratch, "storage"));
  const media = createMediaService(database, storage);
  const publicSite = createPostgresPublicSiteRepository(database);
  const auth = createPostgresAuthRepository(database);
  const authMiddleware = createAuthMiddleware(auth);
  const app = createApp({
    health: { database: async () => true }, routers: [
      createAuthRouter({ repository: auth, authMiddleware, trustProxy: false, cookieSecure: false }),
      createUsersRouter({ authMiddleware, service: createUserAdminService(database), profileService: profiles, trustProxy: false }),
      createProfileRouter({ authMiddleware, service: profiles, trustProxy: false }),
      createMediaRouter({ authMiddleware, service: media, trustProxy: false, maxBytes: 1_000_000, publicBaseUrl: "", pathPrefix: "rnav" }),
    ],
  });
  const server = listener = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  function request(path: string, cookie = "", method = "GET", body?: object) {
    return fetch(`${origin}/api/v1${path}`, {
      method, headers: { origin, cookie, ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}) },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
  }
  async function check(response: Response, status: number) {
    assert.equal(response.status, status, response.url + " " + (response.status !== status ? await response.text() : ""));
    return response;
  }
  async function login(username: string) {
    const response = await check(await request("/auth/login", "", "POST", { username, password }), 200);
    return response.headers.get("set-cookie")!.split(";")[0];
  }
  const adminCookie = await login("admin");
  let memberCookie = await login("zhangsan");
  await check(await request("/auth/login", "", "POST", { username: "old-system", password }), 401);
  await check(await request("/users/directory"), 401);
  const directory = await (await check(await request("/users/directory", memberCookie), 200)).json();
  assert.equal(directory.members.length, 2);
  assert.deepEqual(directory.members.find((item: { userId: string }) => item.userId === member).degrees, ["phd"]);
  assert.equal(directory.members.find((item: { userId: string }) => item.userId === teacher).memberRole, "teacher");
  assert.deepEqual(directory.members.find((item: { userId: string }) => item.userId === teacher).degrees, ["phd"]);
  assert.doesNotMatch(JSON.stringify(directory), /login-only|Old system|accountEmail|mustChangePassword/);
  await check(await request("/users", memberCookie), 403);
  await check(await request(`/users/${member}/profile`, memberCookie, "PUT", {}), 403);
  await check(await request(`/users/${member}/tier`, memberCookie, "PUT", { baseTier: "super" }), 403);
  await check(await request("/permissions/catalog", adminCookie), 404);

  await check(await request(`/users/${admin}/tier`, adminCookie, "PUT", { baseTier: "normal" }), 409);
  await check(await request(`/users/${member}/tier`, adminCookie, "PUT", { baseTier: "super" }), 204);
  await check(await request("/users", memberCookie), 401);
  memberCookie = await login("zhangsan");
  const accountList = await (await check(await request("/users", memberCookie), 200)).json();
  assert.deepEqual(accountList.users.filter((item: { accountKind: string }) => item.accountKind === "system").map((item: { username: string }) => item.username), ["admin"]);
  await check(await request(`/users/${member}/tier`, adminCookie, "PUT", { baseTier: "normal" }), 204);
  memberCookie = await login("zhangsan");
  await check(await request("/users", memberCookie), 403);

  async function saveProfile(id: string, cookie: string, fields: object, adminEdit = false) {
    const path = adminEdit ? `/users/${id}/profile` : "/profile";
    const current = await (await check(await request(path, cookie), 200)).json();
    const data = profileUpdateSchema.parse(Object.fromEntries(Object.keys(profileUpdateSchema.shape).map((key) => [key, current[key]])));
    return (await check(await request(path, cookie, "PUT", {
      ...data, ...(adminEdit ? { memberRole: current.memberRole, memberStatus: current.memberStatus, degrees: current.degrees, publicVisible: current.publicVisible } : {}),
      ...fields,
    }), 200)).json();
  }

  const updated = await saveProfile(member, adminCookie, { degrees: ["master", "phd"] }, true);
  assert.deepEqual(updated.degrees, ["phd", "master"]);
  const publicProfiles = await publicSite.getTeamMembers();
  const item = publicProfiles.find((row) => row.slug === "zhangsan");
  assert.equal(item?.group, "phd");
  assert.deepEqual(item?.degrees?.map((degree) => degree.zh), ["博士", "硕士"]);
  assert.equal(publicProfiles.find((row) => row.slug === "lisi")?.group, "advisor");
  await saveProfile(member, adminCookie, { publicFields: ["name_zh"], memberStatus: "alumni" }, true);
  const hidden = (await publicSite.getTeamMembers()).find((row) => row.slug === "zhangsan");
  assert.equal(hidden?.group, "alumni");
  assert.equal(hidden?.degrees, undefined);

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=", "base64");
  async function upload(category: string, cookie: string, target?: string, expected = 201) {
    const form = new FormData();
    form.set("file", new Blob([png], { type: "image/png" }), "upload.png");
    form.set("category", category);
    if (target) form.set("avatarUserId", target);
    return (await check(await request("/media/upload", cookie, "POST", form), expected)).json();
  }

  await upload("avatar", memberCookie, teacher, 403);
  const first = await upload("avatar", memberCookie);
  assert.equal(first.filename, "zhangsan.png");
  assert.match(first.objectKey, /^rnav\/avatar\/[^/]+\/zhangsan\.png$/);
  await saveProfile(member, memberCookie, { avatarAssetId: first.id, publicFields: ["name_zh", "academic_stage", "avatar"] });
  const publishedVersion = join(scratch, "publication");
  await preparePublication(database, storage, publishedVersion);
  const snapshot = await validateBundle(publishedVersion);
  assert.match((snapshot.members.zhangsan as { member: { image: { src: string } } }).member.image.src, /^\/published-media\//);
  const pngResponse = await check(await request(`/media/files/${first.id}`, adminCookie), 200);
  assert.deepEqual(Buffer.from(await pngResponse.arrayBuffer()), png);

  const second = await upload("avatar", adminCookie, member);
  assert.equal(second.filename, "zhangsan.png");
  assert.notEqual(second.objectKey, first.objectKey);
  await database.query("INSERT INTO news_items(id,image_src) VALUES('shared-photo',$1)", [first.url]);
  await saveProfile(member, memberCookie, { avatarAssetId: second.id });
  assert.equal((await media.getReferences(first.id)).count, 1);
  assert.equal((await media.list({ status: "recycled" })).length, 0);
  const replacement = await upload("site", adminCookie);
  await database.query("UPDATE news_items SET image_src=$1 WHERE id='shared-photo'", [replacement.url]);
  assert.deepEqual((await media.list({ status: "recycled", category: "avatar" })).map((row) => row.id), [first.id]);
  await check(await request(`/media/files/${second.id}`, ""), 401);
  const teacherCookie = await login("lisi");
  const otherMemberResponse = await check(await request(`/media/files/${second.id}`, teacherCookie), 200);
  assert.deepEqual(Buffer.from(await otherMemberResponse.arrayBuffer()), png);

  const shared = await upload("site", adminCookie);
  await database.query("INSERT INTO page_content(page_key,content_json) VALUES('smoke-a',$1),('smoke-b',$1)", [{ image: { assetId: shared.id } }]);
  await database.query("DELETE FROM page_content WHERE page_key='smoke-a'");
  assert.equal((await media.getReferences(shared.id)).count, 1);
  await database.query("UPDATE page_content SET content_json='{}' WHERE page_key='smoke-b'");
  assert.equal((await media.list({ status: "recycled", category: "site" }))[0].id, shared.id);
  assert.deepEqual(await media.pruneReplacedImages(), { deleted: 0, failed: 0 });
  await database.query("UPDATE media_assets SET recycled_at=now()-interval '4 days' WHERE auto_delete");
  assert.deepEqual(await media.pruneReplacedImages(), { deleted: 2, failed: 0 });
  assert.deepEqual(await media.pruneReplacedImages(), { deleted: 0, failed: 0 });
  await assert.rejects(storage.getObject(first.objectKey), { code: "ENOENT" });
  await assert.rejects(storage.getObject(shared.objectKey), { code: "ENOENT" });
  assert.deepEqual(await storage.getObject(second.objectKey), png);
  await validateBundle(publishedVersion);

  const archiveImage = await upload("site", adminCookie);
  await database.query("INSERT INTO team_members(slug,group_key,image_asset_id) VALUES('archived-fixture','phd',$1)", [archiveImage.id]);
  await database.query("INSERT INTO page_content(page_key,content_json) VALUES('smoke-archive',$1)", [{ image: { src: archiveImage.url } }]);
  await database.query("DELETE FROM page_content WHERE page_key='smoke-archive'");
  assert.equal((await media.getReferences(archiveImage.id)).count, 1);
  assert.equal((await media.list({ status: "active", category: "site" })).some((asset) => asset.id === archiveImage.id), true);
  console.log("PASS: PostgreSQL 14 migration, account roles, directory privacy, public identities, avatar naming, shared references and pruning");
} finally {
  listener?.closeAllConnections();
  if (listener) await new Promise<void>((resolve) => listener!.close(() => resolve()));
  await pool?.end();
  if (started) docker("rm", "-f", name);
  await rm(scratch, { recursive: true, force: true });
}
