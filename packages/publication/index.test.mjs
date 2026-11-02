import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pageKeys, sha256, approveBundle, activateBundle, readCurrent, validateBundle, safeFile } from './index.mjs';

async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'rnav-publish-')); const draft=join(root,'draft'); await mkdir(join(draft,'media'),{recursive:true});
  const bytes=Buffer.from('%PDF-test-public-copy'), hash=sha256(bytes);
  const snapshot={schemaVersion:1,publicationId:'reviewed-v1',generatedAt:new Date().toISOString(),pages:Object.fromEntries(pageKeys.map(key=>[key,{}])),members:{},media:[{path:`media/${hash}.pdf`,sha256:hash,contentType:'application/pdf',size:bytes.length}]};
  snapshot.pages.home={pdf:{src:`/published-media/reviewed-v1/${hash}.pdf`}};
  await writeFile(join(draft,snapshot.media[0].path),bytes); await writeFile(join(draft,'snapshot.json'),JSON.stringify(snapshot));
  return {root,draft,snapshot,hash:sha256(JSON.stringify(snapshot)),publicRoot:join(root,'public')};
}

test('only reviewed, complete bundles activate; extra private files never copy to cloud reader',async()=>{
  const f=await fixture();
  try {
    await assert.rejects(activateBundle(f.draft,f.publicRoot,'none'));
    await assert.rejects(approveBundle(f.draft,'wrong-review-hash'));
    await approveBundle(f.draft,f.hash);
    await writeFile(join(f.draft,'private.txt'),'must-not-publish');
    await activateBundle(f.draft,f.publicRoot,'none');
    assert.equal((await readCurrent(f.publicRoot)).publicationId,'reviewed-v1');
    await assert.rejects(readFile(join(f.publicRoot,'current','private.txt')));
    await assert.rejects(activateBundle(f.draft,f.publicRoot,'stale-version'));
  } finally { await rm(f.root,{recursive:true,force:true}); }
});

test('corrupt media and modified approval cannot replace last-known-good snapshot',async()=>{
  const f=await fixture();
  try {
    await approveBundle(f.draft,f.hash); await activateBundle(f.draft,f.publicRoot,'none');
    await writeFile(join(f.draft,f.snapshot.media[0].path),'corrupted');
    await assert.rejects(validateBundle(f.draft));
    await assert.rejects(activateBundle(f.draft,f.publicRoot,'reviewed-v1'));
    assert.equal((await readCurrent(f.publicRoot)).publicationId,'reviewed-v1');
  } finally { await rm(f.root,{recursive:true,force:true}); }
});

test('traversal, symlink and unlisted media references are rejected',async()=>{
  const f=await fixture();
  try {
    await assert.rejects(safeFile(f.draft,'../private'));
    await symlink('/etc/passwd',join(f.draft,'link')); await assert.rejects(safeFile(f.draft,'link'));
    f.snapshot.pages.home={src:'/published-media/another-version/missing.png'};
    await writeFile(join(f.draft,'snapshot.json'),JSON.stringify(f.snapshot)); await assert.rejects(validateBundle(f.draft));
  } finally { await rm(f.root,{recursive:true,force:true}); }
});

test('an approved retained version can roll back a newer publication without overwriting content',async()=>{
  const f=await fixture();
  try {
    await approveBundle(f.draft,f.hash); await activateBundle(f.draft,f.publicRoot,'none');
    f.snapshot.publicationId='reviewed-v2';
    f.snapshot.pages.home={title:'version 2'};
    await writeFile(join(f.draft,'snapshot.json'),JSON.stringify(f.snapshot));
    await rm(join(f.draft,'approval.json'));
    await approveBundle(f.draft,sha256(JSON.stringify(f.snapshot)));
    await activateBundle(f.draft,f.publicRoot,'reviewed-v1');
    assert.equal((await readCurrent(f.publicRoot)).publicationId,'reviewed-v2');
    await activateBundle(join(f.publicRoot,'versions','reviewed-v1'),f.publicRoot,'reviewed-v2');
    assert.equal((await readCurrent(f.publicRoot)).publicationId,'reviewed-v1');
  } finally { await rm(f.root,{recursive:true,force:true}); }
});

test('known private payload fields never pass bundle verification',async()=>{
  const f=await fixture();
  try {
    f.snapshot.pages.team={password_hash:'never public'};
    await writeFile(join(f.draft,'snapshot.json'),JSON.stringify(f.snapshot));
    await assert.rejects(validateBundle(f.draft),/Private field|Unknown public field/);
  } finally { await rm(f.root,{recursive:true,force:true}); }
});

test('signed approval requires the correct trusted key and records activation audit',async()=>{
 const {generateKeyPairSync}=await import('node:crypto');const f=await fixture();
 try{const k=generateKeyPairSync('ed25519'),other=generateKeyPairSync('ed25519');await approveBundle(f.draft,f.hash,{actor:'reviewer-id',privateKey:k.privateKey});await assert.rejects(activateBundle(f.draft,f.publicRoot,'none',{requireSignature:true,publicKey:other.publicKey}));await activateBundle(f.draft,f.publicRoot,'none',{requireSignature:true,publicKey:k.publicKey});assert.match(await readFile(join(f.publicRoot,'audit.ndjson'),'utf8'),/reviewer-id/);}finally{await rm(f.root,{recursive:true,force:true});}
});
