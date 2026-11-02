import fields from './fields.json' with { type: 'json' };
import { createHash, randomUUID, sign, verify } from 'node:crypto';
import { lstat, readFile, realpath, mkdir, symlink, rename, cp } from 'node:fs/promises';
import { join, sep } from 'node:path';
export const pageKeys = ['bootstrap','home','directions','homepage','research','news','team','facilities','contact'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const mediaPattern = /^media\/[a-f0-9]{64}\.(?:png|jpg|webp|pdf)$/;
export function validatePublication(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1 || !idPattern.test(value.publicationId) || !Number.isFinite(Date.parse(value.generatedAt))) throw Error('Invalid publication metadata');
  if (Object.keys(value).sort().join() !== 'generatedAt,media,members,pages,publicationId,schemaVersion') throw Error('Unexpected publication fields');
  if (!value.pages || Object.keys(value.pages).sort().join() !== [...pageKeys].sort().join()) throw Error('Incomplete public pages');
  if (!value.members || typeof value.members !== 'object' || Array.isArray(value.members) || !Array.isArray(value.media) || value.media.length > 10000) throw Error('Invalid publication collections');
  for (const [slug, profile] of Object.entries(value.members)) {
    if (!slug || slug.length > 200 || ['__proto__','constructor','prototype'].includes(slug) || !profile || typeof profile !== 'object') throw Error('Invalid member profile');
  }
  const allowedFields = new Set(fields);
  const rejectPrivate = value => {
    if (Array.isArray(value)) value.forEach(rejectPrivate);
    else if (value && typeof value === 'object') for (const [key,item] of Object.entries(value)) {
      if (!allowedFields.has(key)) throw Error('Unknown public field: '+key);
      if (/^(password_?hash|password|token_?hash|session_?tokens|system_?secrets|private_?notes|vendor_?serial|borrower_?contact)$/i.test(key)) throw Error('Private field in public payload');
      rejectPrivate(item);
    }
  };
  Object.values(value.pages).forEach(rejectPrivate); Object.values(value.members).forEach(rejectPrivate);
  const paths = new Set();
  for (const item of value.media) {
    if (!item || !mediaPattern.test(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256) || !item.path.includes(item.sha256) || !Number.isSafeInteger(item.size) || item.size < 1 || item.size > 20971520 || !['image/png','image/jpeg','image/webp','application/pdf'].includes(item.contentType) || paths.has(item.path)) throw Error('Invalid media manifest');
    paths.add(item.path);
  }
  return value;
}
// Never follow symlinks from an untrusted incoming bundle or accept traversal paths.
export async function safeFile(root, relative) {
  if (relative.startsWith('/') || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw Error('Unsafe path');
  const base = await realpath(root);
  let current = base;
  for (const part of relative.split('/')) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw Error('Symlink in publication');
  }
  if (!current.startsWith(base + sep)) throw Error('Unsafe path');
  return current;
}
export async function validateBundle(directory) {
  const snapshotPath = await safeFile(directory, 'snapshot.json');
  if ((await lstat(snapshotPath)).size > 20971520) throw Error('Snapshot too large');
  const bytes = await readFile(snapshotPath);
  if (bytes.length > 20971520) throw Error('Snapshot too large');
  const publication = validatePublication(JSON.parse(bytes));
  for (const item of publication.media) {
    const mediaPath = await safeFile(directory,item.path);
    if ((await lstat(mediaPath)).size !== item.size) throw Error('Media size mismatch');
    const data = await readFile(mediaPath);
    if (data.length !== item.size || sha256(data) !== item.sha256) throw Error('Media checksum mismatch');
  }
  // All generated local URLs must resolve to declared, verified media.
  const paths = new Set(publication.media.map(item => item.path));
  const prefix = `/published-media/${publication.publicationId}/`;
  const inspect = value => {
    if (typeof value === 'string' && value.startsWith('/published-media/')) {
      if (!value.startsWith(prefix) || !paths.has('media/' + value.slice(prefix.length))) throw Error('Unlisted public media');
    } else if (Array.isArray(value)) value.forEach(inspect);
    else if (value && typeof value === 'object') Object.values(value).forEach(inspect);
  };
  inspect(publication.pages); inspect(publication.members);
  return publication;
}
export async function approveBundle(directory, expectedHash, options = {}) {
  await validateBundle(directory);
  const hash = sha256(await readFile(await safeFile(directory, 'snapshot.json')));
  if (hash !== expectedHash) throw Error('Approval hash does not match reviewed snapshot');
  const { writeFile } = await import('node:fs/promises');
  const review = { sha256: hash, approvedAt: new Date().toISOString(), actor: options.actor ?? 'local-operator' };
  const signature = options.privateKey ? sign(null,Buffer.from(JSON.stringify(review)),options.privateKey).toString('base64') : undefined;
  await writeFile(join(directory, 'approval.json'), JSON.stringify({ ...review, signature }), { flag: 'wx', mode: 0o600 });
}
export async function readCurrent(root, options = {}) {
  const base = await realpath(join(root, 'versions'));
  const current = await realpath(join(root, 'current'));
  if (!current.startsWith(base + sep)) throw Error('Invalid current pointer');
  const bytes=await readFile(await safeFile(current,'snapshot.json'));
  const approval=JSON.parse(await readFile(await safeFile(current,'approval.json'),'utf8'));
  if(approval.sha256!==sha256(bytes))throw Error('Current snapshot integrity failed');
  if(options.requireSignature||options.publicKey){const{signature,...review}=approval;if(!signature||!options.publicKey||!verify(null,Buffer.from(JSON.stringify(review)),options.publicKey,Buffer.from(signature,'base64')))throw Error('Untrusted current publication');}
  return validatePublication(JSON.parse(bytes));
}
export async function activateBundle(directory, root, expectedCurrent, options = {}) {
  const publication = await validateBundle(directory);
  const approval = JSON.parse(await readFile(await safeFile(directory, 'approval.json'), 'utf8'));
  if (options.requireSignature || options.publicKey) {
    const {signature,...review}=approval;
    if (!signature || !options.publicKey || !verify(null,Buffer.from(JSON.stringify(review)),options.publicKey,Buffer.from(signature,'base64'))) throw Error('Untrusted publication approval');
  }
  if (approval.sha256 !== sha256(await readFile(await safeFile(directory, 'snapshot.json')))) throw Error('Unapproved or modified publication');
  await mkdir(join(root,'versions'), { recursive: true });
  // A lock prevents racing activations; no stale-lock deletion is performed automatically.
  const lock = join(root,'.activate-lock');
  await mkdir(lock);
  const { rm } = await import('node:fs/promises');
  try {
    let current = 'none';
    try { current = (await readCurrent(root)).publicationId; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current !== expectedCurrent) throw Error('Current publication changed; review again');
    const target = join(root,'versions',publication.publicationId);
    let exists = false;
    try { if((await lstat(target)).isSymbolicLink())throw Error('Version root symlink forbidden'); exists = true; } catch(error) { if(error.code !== 'ENOENT') throw error; }
    if (exists) {
      await validateBundle(target);
      if (sha256(await readFile(await safeFile(target,'snapshot.json'))) !== approval.sha256) throw Error('Publication ID already used');
    } else {
      await mkdir(target);
      await mkdir(join(target,'media'));
      for (const name of ['snapshot.json','approval.json',...publication.media.map(item=>item.path)]) {
        await cp(await safeFile(directory,name),join(target,name),{ errorOnExist:true, force:false });
      }
      await validateBundle(target);
    }
    const pointer = join(root,`.current-${randomUUID()}`);
    await symlink(`versions/${publication.publicationId}`,pointer);
    const { appendFile } = await import('node:fs/promises');
    await appendFile(join(root,'audit.ndjson'),JSON.stringify({action:'activation',from:current,to:publication.publicationId,sha256:approval.sha256,reviewer:approval.actor ?? 'legacy-local',at:new Date().toISOString()})+'\n',{mode:0o600});
    await rename(pointer,join(root,'current'));
  } finally { await rm(lock,{ recursive:true }); }
}
