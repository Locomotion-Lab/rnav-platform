import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildContract } from "./generate-openapi.js";

test("checked contract includes v1 core routes and cannot drift or revive retired APIs",async()=>{
  const contract=await buildContract();
  assert.equal(JSON.stringify(contract,null,2)+"\n",await readFile(new URL("../../server/contracts/openapi.json",import.meta.url),"utf8"));
  for(const path of ["/api/v1/auth/login","/api/v1/users","/api/v1/lab-assets","/api/v1/media/files/{id}"]) assert.ok(contract.paths[path]);
  assert.equal(Object.keys(contract.paths).some(path=>/monitor|procurement/.test(path)),false);
});
