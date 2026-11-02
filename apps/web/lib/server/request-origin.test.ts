import assert from "node:assert/strict";
import test from "node:test";
import { getRequestOrigin } from "./request-origin.ts";
test("standalone origin uses Host and ignores forged forwarding metadata",()=>{
  const request=new Request("http://0.0.0.0:3000/api/profile",{headers:{host:"127.0.0.1:13000","x-forwarded-host":"attacker.example","x-forwarded-proto":"https"}});
  assert.equal(getRequestOrigin(request).origin,"http://127.0.0.1:13000");
  assert.throws(()=>getRequestOrigin(new Request("http://localhost",{headers:{host:"bad/host"}})));
});
