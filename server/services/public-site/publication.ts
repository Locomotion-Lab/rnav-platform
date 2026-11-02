import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { pageKeys, sha256, validateBundle, type Publication } from "@rnav/publication";
import { createPostgresPublicSiteRepository } from "./postgres-repository.js";
import { createPublicSiteService } from "./service.js";
import type { StorageProvider } from "../storage/provider.js";

const allowedOrigins = new Set([
  "https://r-navigation-1326672316.cos.ap-beijing.myqcloud.com",
  "https://liesmars.whu.edu.cn",
]);
function mediaType(bytes: Buffer) {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ["image/png","png"];
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return ["image/jpeg","jpg"];
  if (bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WEBP") return ["image/webp","webp"];
  if (bytes.toString("ascii",0,5)==="%PDF-") return ["application/pdf","pdf"];
  throw new Error("Unsupported public media type");
}
async function download(src: string) {
  const url = new URL(src);
  if (!allowedOrigins.has(url.origin) || url.username || url.password || url.hash || url.search) throw new Error("Public media origin is not approved");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error("Public media download failed");
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > 20971520) throw new Error("Public media too large"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

// The same tested PublicSiteService projections used by public APIs are the only export boundary.
export async function preparePublication(pool: Pool, storage: StorageProvider, destination: string) {
  const client = await pool.connect();
  const publication: Publication = { schemaVersion:1, publicationId:randomUUID(), generatedAt:new Date().toISOString(), pages:{}, members:{}, media:[] };
  const objects = new Map<string,{object_key:string;storage_provider:"local"|"cos"}>();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const service = createPublicSiteService(createPostgresPublicSiteRepository(client));
    const methods = { bootstrap:service.getBootstrap, home:service.getHome, directions:service.getDirections, homepage:service.getHomepage, research:service.getResearch, news:service.getNews, team:service.getTeam, facilities:service.getFacilities, contact:service.getContact };
    for (const key of pageKeys) publication.pages[key] = await methods[key as keyof typeof methods]();
    const slugs = new Set<string>();
    const findSlugs = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(findSlugs);
      else if (value && typeof value === "object") {
        if ("slug" in value && typeof value.slug === "string" && value.slug) slugs.add(value.slug);
        Object.values(value).forEach(findSlugs);
      }
    };
    findSlugs(publication.pages.team);
    for (const slug of slugs) {
      const profile = await service.getTeamMemberProfile(slug);
      if (profile) Object.defineProperty(publication.members,slug,{value:profile,enumerable:true});
    }
    const result = await client.query<{url:string;object_key:string;storage_provider:"local"|"cos"}>("SELECT url,object_key,storage_provider FROM media_assets WHERE status='active'");
    result.rows.forEach(row => objects.set(row.url,row));
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  // Exclusive destination, never overwrite an already reviewed package.
  await mkdir(destination);
  await mkdir(join(destination,"media"));
  const copied = new Map<string,string>();
  const transform = async (value: unknown, field = ""): Promise<unknown> => {
    if (typeof value === "string" && (field === "src" || (field === "href" && (objects.has(value) || value.startsWith("/api/media/files/") || /\.pdf(?:$|[?#])/i.test(value))))) {
      if (!value) return value;
      // Repo-native immutable brand/placeholder assets ship with the independent web image.
      if (/^\/(?:brand\/|og-default\.svg$)/.test(value)) return value;
      if (copied.has(value)) return copied.get(value);
      const object = objects.get(value);
      let bytes: Buffer;
      if (object?.storage_provider === "local") {
        const provider = storage.forProvider?.("local") ?? storage;
        if (!provider.getObject) throw new Error("Local object reader unavailable");
        bytes = await provider.getObject(object.object_key);
      } else bytes = await download(value);
      if (!bytes.length || bytes.length > 20971520) throw new Error("Public media size invalid");
      const [contentType,extension] = mediaType(bytes);
      const hash = sha256(bytes), path = `media/${hash}.${extension}`;
      if (!publication.media.some(item=>item.path===path)) {
        await writeFile(join(destination,path),bytes,{flag:"wx",mode:0o600});
        publication.media.push({path,sha256:hash,contentType,size:bytes.length});
      }
      const url = `/published-media/${publication.publicationId}/${hash}.${extension}`;
      copied.set(value,url); return url;
    }
    if (Array.isArray(value)) return Promise.all(value.map(item=>transform(item)));
    if (value && typeof value === "object") {
      const result: Record<string,unknown> = Object.create(null);
      for (const [key,item] of Object.entries(value)) result[key] = await transform(item,key);
      return result;
    }
    return value;
  };
  publication.pages = await transform(publication.pages) as Record<string,unknown>;
  publication.members = await transform(publication.members) as Record<string,unknown>;
  const bytes = JSON.stringify(publication,null,2)+"\n";
  await writeFile(join(destination,"snapshot.json"),bytes,{flag:"wx",mode:0o600});
  await validateBundle(destination);
  return {publicationId:publication.publicationId,sha256:sha256(bytes),pages:pageKeys.length,members:Object.keys(publication.members).length,media:publication.media.length};
}
