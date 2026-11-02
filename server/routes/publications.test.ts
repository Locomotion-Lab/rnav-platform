import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {createPublicationsRouter} from './publications.js';
test('public release preparation requires dedicated publish permission, not ordinary CMS edit',async()=>{
 const app=express();app.use(express.json());let called=false;
 app.use(createPublicationsRouter({authMiddleware:(q,_s,n)=>{q.authUser={id:'00000000-0000-4000-8000-000000000001',username:'editor',displayName:'Editor',baseTier:'normal',permissions:['site.content.write'],mustChangePassword:false};n();},service:{prepare:async()=>{called=true;return{};}}as never}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const a=server.address();assert.ok(a&&typeof a!=='string');try{const r=await fetch(`http://127.0.0.1:${a.port}/api/publications/prepare`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,403);assert.equal(called,false);}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
