import assert from "node:assert/strict";
import test from "node:test";
import { ProviderHttpError } from "./providers/http.js";
import { createScholarlySyncService } from "./service.js";

const normalized = { openalexWorkId: "W1", doi: "10.1/example", doiUrl: "https://doi.org/10.1/example", title: "Safe work", year: 2026, venue: "Test Venue", providerType: "article", mappedType: "journal", authors: [], arxivUrl: null, landingPageUrl: null, providerUpdatedAt: null };

function testService(existingTargetRegistry = false) {
  const states = new Map([["safe", { decision: "pending", researchItemId: null as string | null, mergedInto: null as string | null }], ["duplicate", { decision: "pending", researchItemId: null as string | null, mergedInto: null as string | null }], ["merge", { decision: "pending", researchItemId: null as string | null, mergedInto: null as string | null }]]);
  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (sql.startsWith("SELECT * FROM scholarly_works")) { const state = states.get(String(values[0])); return { rows: state ? [{ decision: state.decision, research_item_id: state.researchItemId, source_snapshot: { normalized } }] : [], rowCount: state ? 1 : 0 }; }
      if (sql.startsWith("SELECT decision,research_item_id")) { const state = states.get(String(values[0])); return { rows: state ? [{ decision: state.decision, research_item_id: state.researchItemId, source_snapshot: state.mergedInto ? { mergedIntoResearchItemId: state.mergedInto } : {} }] : [], rowCount: state ? 1 : 0 }; }
      if (sql.startsWith("SELECT COALESCE(max(sort_order)")) return { rows: [{ sort_order: 0 }], rowCount: 1 };
      if (sql.includes("SELECT id FROM research_items WHERE id=$1 FOR UPDATE")) return { rows: [{ id: values[0] }], rowCount: 1 };
      if (sql.startsWith("SELECT id FROM scholarly_works WHERE research_item_id")) return { rows: existingTargetRegistry ? [{ id: "primary-registry" }] : [], rowCount: existingTargetRegistry ? 1 : 0 };
      if (sql.startsWith("SELECT id FROM research_items WHERE id")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("UPDATE scholarly_works SET decision='accepted'")) { const state = states.get(String(values[0])); if (state) { state.decision = "accepted"; if (sql.includes("research_item_id=NULL")) { state.researchItemId = null; state.mergedInto = String(values[1]); } else state.researchItemId = String(values[1]); } return { rows: [{ id: values[0] }], rowCount: state ? 1 : 0 }; }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const repository = {
    async getWorksByIds(ids: string[]) { return ids.map((id) => ({ id, decision: states.get(id)?.decision, sourceSnapshot: { normalized }, duplicateSuggestion: id === "duplicate" ? { researchItemId: "paper-existing", confidence: "high" } : null })); },
  };
  const pool = { query: client.query.bind(client), connect: async () => client };
  return { states, service: createScholarlySyncService({ pool: pool as never, repository: repository as never, openAlex: {} as never, crossref: {} as never, enabled: true, providerConfig: { openAlexKeyConfigured: false, crossrefContactConfigured: false } }) };
}

test("bulk accept skips duplicate suggestions and retries accepted works idempotently", async () => {
  const { service } = testService();
  const first = await service.bulkAccept(["safe", "duplicate"], "actor");
  assert.equal(first.accepted, 1); assert.equal(first.skipped, 1);
  const retry = await service.bulkAccept(["safe"], "actor");
  assert.equal(retry.alreadyAccepted, 1); assert.equal(retry.failed, 0);
});

test("bulk merge is per-item and retry-safe", async () => {
  const { service } = testService();
  const first = await service.bulkMerge([{ workId: "merge", researchItemId: "paper-existing" }], "actor");
  assert.equal(first.merged, 1);
  const retry = await service.bulkMerge([{ workId: "merge", researchItemId: "paper-existing" }], "actor");
  assert.equal(retry.alreadyMerged, 1); assert.equal(retry.failed, 0);
});

test("merge keeps a second OpenAlex identity as an accepted alias when the public paper already has a registry", async () => {
  const { service, states } = testService(true);
  const first = await service.mergeWork("merge", "paper-existing", "actor");
  assert.equal(first.alias, true); assert.equal(states.get("merge")?.researchItemId, null); assert.equal(states.get("merge")?.mergedInto, "paper-existing");
  const retry = await service.mergeWork("merge", "paper-existing", "actor");
  assert.equal(retry.unchanged, true); assert.equal(retry.alias, true);
});

test("a member-triggered sync always leaves newly discovered works for review", async () => {
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const repository = {
    getProfile: async () => ({ userId: "member-1" }),
    createRun: async () => "run-1",
    listSyncProfiles: async () => [{ userId: "member-1", openalexAuthorId: "A1", syncFromYear: 2020, syncToYear: 2026, newWorkPolicy: "auto" }],
    findStoredWork: async () => null,
    upsertDiscoveredWork: async () => ({ created: true, changed: true, row: { id: "work-1", decision: "pending", source_type: "openalex", source_snapshot: {} } }),
    updateMemberSync: async () => undefined,
    finishRun: async () => undefined,
  };
  const service = createScholarlySyncService({
    pool: { query: client.query.bind(client), connect: async () => client } as never,
    repository: repository as never,
    openAlex: { getWorksByAuthor: async () => [{ id: "https://openalex.org/W1", title: "New paper", publication_year: 2026, type: "article", authorships: [] }] } as never,
    crossref: {} as never, enabled: true,
    providerConfig: { openAlexKeyConfigured: true, crossrefContactConfigured: false },
  });
  const result = await service.syncMember("member-1", "member-1", "self");
  assert.equal(result.candidatesCreated, 1);
  assert.equal(result.worksUpdated, 0);
  assert.equal(queries.some((sql) => sql.startsWith("SELECT * FROM scholarly_works")), false);
});

test("scheduled sync never auto-accepts when the configured year range is incomplete", async () => {
  const queries: string[] = [];
  const client = { async query(sql: string) { queries.push(sql); if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] }; return { rows: [], rowCount: 1 }; }, release() {} };
  const repository = {
    createRun: async () => "run-1",
    listSyncProfiles: async () => [{ userId: "member-1", openalexAuthorId: "A1", syncFromYear: 2020, syncToYear: null, newWorkPolicy: "auto" }],
    findStoredWork: async () => null,
    upsertDiscoveredWork: async () => ({ created: true, changed: true, row: { id: "work-1", decision: "pending", source_type: "openalex", source_snapshot: {} } }),
    updateMemberSync: async () => undefined,
    finishRun: async () => undefined,
  };
  const service = createScholarlySyncService({
    pool: { query: client.query.bind(client), connect: async () => client } as never, repository: repository as never,
    openAlex: { getWorksByAuthor: async () => [{ id: "https://openalex.org/W1", title: "New paper", publication_year: 2026, type: "article", authorships: [] }] } as never,
    crossref: {} as never, enabled: true, providerConfig: { openAlexKeyConfigured: true, crossrefContactConfigured: false },
  });
  const result = await service.syncAll(null, true);
  assert.equal(result.candidatesCreated, 1); assert.equal(result.worksUpdated, 0);
  assert.equal(queries.some((sql) => sql.startsWith("SELECT * FROM scholarly_works")), false);
});

test("system accounts are rejected before author lookup or synchronization", async () => {
  let providerCalled = false, connected = false;
  const service = createScholarlySyncService({
    pool: { query: async () => ({ rows: [] }), connect: async () => { connected = true; throw new Error("must not connect"); } } as never,
    repository: { getProfile: async () => null } as never,
    openAlex: { getAuthor: async () => { providerCalled = true; return {}; } } as never,
    crossref: {} as never, enabled: true,
    providerConfig: { openAlexKeyConfigured: true, crossrefContactConfigured: false },
  });
  await assert.rejects(service.verifyAuthor("system-1", "A1", "system-1", "self"), /成员不存在/);
  await assert.rejects(service.syncMember("system-1", "system-1", "self"), /成员不存在/);
  assert.equal(providerCalled, false);
  assert.equal(connected, false);
});

const authorCandidate = { id: "A1", displayName: "Student", orcid: null, institution: "Wuhan University", worksCount: 0, recentWorks: [] };
function identityService(openAlex: Record<string, unknown>, repositoryOverrides: Record<string, unknown> = {}) {
  const repository = {
    getProfile: async () => ({ userId: "member-1", memberName: "学生姓名", orcidId: "0000-0002-1825-0097" }),
    verifyAuthor: async (_userId: string, openalexAuthorId: string, orcidId: string | null) => ({ userId: "member-1", openalexAuthorId, orcidId }),
    ...repositoryOverrides,
  };
  return createScholarlySyncService({
    pool: { query: async () => ({ rows: [] }), connect: async () => { throw new Error("unused"); } } as never,
    repository: repository as never, openAlex: openAlex as never, crossref: {} as never, enabled: true,
    providerConfig: { openAlexKeyConfigured: true, crossrefContactConfigured: false },
  });
}

test("ORCID identity lookup returns the direct OpenAlex author without name fallback", async () => {
  let searches = 0;
  const service = identityService({ resolveAuthorByOrcid: async () => ({ ...authorCandidate, orcid: "0000-0002-1825-0097" }), searchAuthorCandidates: async () => { searches += 1; return []; } });
  const result = await service.resolveAuthor("member-1", { orcidId: "0000-0002-1825-0097", name: "学生姓名", institution: "Wuhan University" });
  assert.equal(result.resolution, "orcid"); assert.equal(result.candidates[0].id, "A1"); assert.equal(result.notice, null); assert.equal(searches, 0);
});

test("an OpenAlex ORCID 404 falls back to member name and optional institution", async () => {
  const searches: Array<[string, string | undefined]> = [];
  const service = identityService({ resolveAuthorByOrcid: async () => null, searchAuthorCandidates: async (name: string, institution?: string) => { searches.push([name, institution]); return [authorCandidate]; } });
  const result = await service.resolveAuthor("member-1", { orcidId: "0000-0002-1825-0097", name: "学生姓名", institution: "Wuhan University" });
  assert.equal(result.resolution, "name_fallback"); assert.deepEqual(searches, [["学生姓名", "Wuhan University"]]);
  assert.equal(result.notice, "OpenAlex 暂未通过该 ORCID 找到作者，已改用姓名和机构搜索，请确认正确的作者记录。");
});

test("an empty name fallback returns the dedicated no-match message", async () => {
  const service = identityService({ resolveAuthorByOrcid: async () => null, searchAuthorCandidates: async () => [] });
  const result = await service.resolveAuthor("member-1", { orcidId: "0000-0002-1825-0097" });
  assert.deepEqual(result.candidates, []); assert.equal(result.notice, "暂未在 OpenAlex 找到匹配作者记录。");
});

test("OpenAlex auth, rate, server, and timeout errors never trigger name fallback", async () => {
  const errors = [
    new ProviderHttpError("OpenAlex", 401, "auth", "OPENALEX_AUTH_ERROR"),
    new ProviderHttpError("OpenAlex", 429, "rate", "OPENALEX_RATE_LIMITED"),
    new ProviderHttpError("OpenAlex", 500, "server", "OPENALEX_PROVIDER_ERROR"),
    new ProviderHttpError("OpenAlex", 0, "timeout", "OPENALEX_TIMEOUT"),
  ];
  for (const expected of errors) {
    let searches = 0;
    const service = identityService({ resolveAuthorByOrcid: async () => { throw expected; }, searchAuthorCandidates: async () => { searches += 1; return []; } });
    await assert.rejects(service.resolveAuthor("member-1", { orcidId: "0000-0002-1825-0097" }), (error: unknown) => error === expected);
    assert.equal(searches, 0);
  }
});

test("manual confirmation accepts a candidate without ORCID and preserves the member ORCID", async () => {
  let verifiedOrcid: string | null | undefined;
  const service = identityService(
    { getAuthor: async () => authorCandidate },
    { verifyAuthor: async (_userId: string, _openalexAuthorId: string, orcidId: string | null) => { verifiedOrcid = orcidId; return { userId: "member-1", orcidId }; } },
  );
  await service.verifyAuthor("member-1", "A1", "actor-1");
  assert.equal(verifiedOrcid, "0000-0002-1825-0097");
});

test("manual confirmation still rejects a candidate with a different non-empty ORCID", async () => {
  const service = identityService({ getAuthor: async () => ({ ...authorCandidate, orcid: "0000-0001-5109-3700" }) });
  await assert.rejects(service.verifyAuthor("member-1", "A1", "actor-1"), (error: unknown) => error instanceof Error && error.message === "所选 OpenAlex 作者与成员 ORCID 不一致");
});
