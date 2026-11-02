import assert from "node:assert/strict";
import test from "node:test";
import { proxyResponse } from "./proxy-response.ts";

test("independent proxy preserves 204 logout cookies and private file security headers",async()=>{
  const logout=await proxyResponse(new Response(null,{status:204,headers:{"set-cookie":"rnav_session=; Max-Age=0"}}),"POST");
  assert.equal(logout.status,204); assert.equal(await logout.text(),"");assert.match(logout.headers.get("set-cookie")!,/Max-Age=0/);
  const media=await proxyResponse(new Response("private",{headers:{"cache-control":"private, no-store","x-content-type-options":"nosniff"}}),"GET");
  assert.equal(media.headers.get("cache-control"),"private, no-store");assert.equal(media.headers.get("x-content-type-options"),"nosniff");
});
