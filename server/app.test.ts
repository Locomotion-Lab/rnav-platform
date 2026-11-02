import assert from "node:assert/strict";
import test from "node:test";
import { Router } from "express";
import { createApp } from "./app.js";

test("independent API serves v1 aliases, rejects retired features and has no page fallback", async () => {
  const router = Router();
  router.get("/api/profile", (_req, res) => res.json({ core: true }));
  const server = createApp({ health: { database: async () => true }, routers: [router] }).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const base = `http://127.0.0.1:${address.port}`;
    for (const path of ["/api/profile", "/api/v1/profile", "/api/v1/health"]) assert.equal((await fetch(base + path)).status, 200);
    for (const path of ["/console", "/", "/api/monitor/public/bootstrap", "/api/procurements", "/api/v1/procurements"]) assert.equal((await fetch(base + path)).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("trusted gateway authentication and business write freeze fail closed",async()=>{
 const router=Router();router.post('/api/action',(_q,r)=>r.json({ok:true}));
 const server=createApp({routers:[router],health:{database:async()=>true},gatewayToken:'test-private-gateway',writeEnabled:false}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const a=server.address();assert.ok(a&&typeof a!=='string');const base=`http://127.0.0.1:${a.port}`;
 try{assert.equal((await fetch(base+'/api/v1/action',{method:'POST',headers:{'x-forwarded-host':'trusted.example'}})).status,403);assert.equal((await fetch(base+'/api/v1/action',{method:'POST',headers:{'x-rnav-gateway-token':'test-private-gateway'}})).status,503);assert.equal((await fetch(base+'/api/health')).status,200);}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
