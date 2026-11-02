import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,stat,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {transferObject} from './media-transfer.js';
test('media copy resumes after interruption, deduplicates, and defaults to no writes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rnav-transfer-'));const bytes=Buffer.alloc(2*1024*1024+3,7),hash=createHash('sha256').update(bytes).digest('hex');const entry={id:'id',object_key:'legacy/a',size_bytes:bytes.length,checksum_sha256:hash,url:'https://old/a'};let fail=true;
 const source={headObject:async()=>({size:bytes.length,etag:'unchanged'}),readRange:async(_k:string,s:number,e:number)=>{if(fail&&s>0)throw Error('Disconnected');return bytes.subarray(s,e+1);}};
 try{assert.equal((await transferObject(entry,source,root)).status,'would-copy');await assert.rejects(stat(join(root,'migrated')));await assert.rejects(transferObject(entry,source,root,true));assert.equal((await stat(join(root,'migrated',hash+'.partial'))).size,1024*1024);fail=false;assert.equal((await transferObject(entry,source,root,true)).status,'copied');assert.equal((await transferObject(entry,source,root,true)).status,'verified-existing');assert.equal((await readFile(join(root,'migrated',hash))).length,bytes.length);}
 finally{await rm(root,{recursive:true,force:true});}
});
test('invalid checksum and changed source fail without publishing a target',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rnav-transfer-'));try{const entry={id:'id',object_key:'key',size_bytes:2,checksum_sha256:'a'.repeat(64),url:'old'};const source={headObject:async()=>({size:3,etag:'v'}),readRange:async()=>Buffer.from('bad')};await assert.rejects(transferObject(entry,source,root,true),/mismatch/);}finally{await rm(root,{recursive:true,force:true});}
});
