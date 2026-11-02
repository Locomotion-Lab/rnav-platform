// Local Docker rehearsal only; refuses remote URLs and never uses SSH.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256, approveBundle, activateBundle } from '@rnav/publication';

const compose=['compose','-p','rnav-phase3-rehearsal','-f','deploy/production/compose.mac.yaml'];
function docker(args, input) {
  const result=spawnSync('docker',args,{input,encoding:'utf8'});
  if(result.status!==0) throw Error(`Local Docker step failed: ${result.stderr.slice(0,1000)}`);
  return result.stdout;
}
function node(script,input='') {
 const bootstrap=`import {readFile as readSecret} from 'node:fs/promises';const dbpass=(await readSecret('/run/secrets/db_migrator_password','utf8')).trim();process.env.DATABASE_URL='postgres://rnav_migrator:'+dbpass+'@db:5432/rnav_platform';`;
 return docker([...compose,'run','--no-deps','--rm','-T','migrate','node','--input-type=module','-e',script],input);
}
const base='http://127.0.0.1:14090';
const token=(await readFile(process.env.RNAV_SECRETS_DIR+'/gateway_token','utf8')).trim();
const password=randomBytes(24).toString('hex');
const id='00000000-0000-4000-8000-00000000aa02';
node(`import pg from 'pg'; import bcrypt from 'bcryptjs';
const password=await new Promise(r=>{let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>r(s))});
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
await pool.query("INSERT INTO users(id,username,display_name,password_hash,base_tier,status,must_change_password,account_kind) VALUES($1,'modular-smoke','Smoke member',$2,'super','active',false,'person') ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,password_hash=EXCLUDED.password_hash",['${id}',await bcrypt.hash(password,12)]);
await pool.query("INSERT INTO user_profiles(user_id,name_zh,name_en,member_slug,public_visible,degree_level,public_fields,phone) VALUES($1,'公开演练成员','Public smoke member','modular-smoke',true,'faculty',ARRAY['name_zh','name_en','avatar'],'PRIVATE-PHONE-MUST-NOT-PUBLISH') ON CONFLICT(user_id) DO NOTHING",['${id}']);
await pool.end();`,password);
const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json','x-rnav-gateway-token':token},body:JSON.stringify({username:'modular-smoke',password})});
if(!login.ok) throw Error(`Login failed ${login.status}`);
const cookie=login.headers.get('set-cookie')?.split(';')[0]; if(!cookie) throw Error('Missing session');
const headers={cookie,origin:base,'x-rnav-gateway-token':token,"x-forwarded-host":"127.0.0.1:14090","x-forwarded-proto":"http"};
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
async function upload(name,bytes,type) {
  const form=new FormData();form.set('file',new Blob([bytes],{type}),name);
  const response=await fetch(base+'/api/v1/media/upload',{method:'POST',headers,body:form});
  if(!response.ok) throw Error(`Upload failed ${response.status}`);
  return response.json();
}
const photo=await upload('public.png',image,'image/png');
const pdf=await upload('public.pdf',Buffer.from('%PDF-1.4\nlocal smoke document\n%%EOF\n'),'application/pdf');
const privateFile=await upload('private.pdf',Buffer.from('%PDF-1.4\nPRIVATE-UNPUBLISHED\n%%EOF\n'),'application/pdf');
if((await fetch(base+privateFile.url,{headers:{'x-rnav-gateway-token':token}})).status!==401) throw Error('Private file accessible anonymously');
if((await fetch(base+privateFile.url,{headers})).status!==200) throw Error('Owner cannot read private file');
node(`import pg from 'pg';const data=JSON.parse(await new Promise(r=>{let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>r(s))}));const p=new pg.Pool({connectionString:process.env.DATABASE_URL});
await p.query("UPDATE user_profiles SET avatar_asset_id=$1 WHERE user_id=$2",[data.photo.id,'${id}']);
await p.query("INSERT INTO research_items(id,title_zh,title_en,pdf_asset_id,pdf_src) VALUES('modular-smoke-paper','演练成果','Smoke publication',$1,$2) ON CONFLICT(id) DO UPDATE SET pdf_asset_id=EXCLUDED.pdf_asset_id,pdf_src=EXCLUDED.pdf_src",[data.pdf.id,data.pdf.url]);
await p.end();`,JSON.stringify({photo,pdf}));
for(const path of ['/api/v1/profile','/api/v1/users','/api/v1/lab-assets','/api/v1/permissions/catalog']) {
 const r=await fetch(base+path,{headers});if(!r.ok)throw Error(`Core route failed ${path} ${r.status}`);
 const text=await r.text();if(path.includes('permissions')&&/monitor\.|procurements\./.test(text))throw Error('Retired permissions leaked');
}
for(const path of ['/api/v1/monitor/public/bootstrap','/api/v1/procurements','/console']) if((await fetch(base+path,{headers:{'x-rnav-gateway-token':token}})).status!==404)throw Error('Retired route still exposed');
const draftId='smoke-'+Date.now();
node(`import pg from 'pg';import {preparePublication} from './server/dist/services/public-site/publication.js';import {createStorage} from './server/dist/services/storage/provider.js';import {loadEnv} from './server/dist/config/env.js';const env=loadEnv();const p=new pg.Pool({connectionString:env.databaseUrl});try{await preparePublication(p,createStorage(env),'/data/publications/${draftId}');}finally{await p.end();}`);
const hostDraft=resolve('data/rehearsal',draftId);await mkdir(resolve('data/rehearsal'),{recursive:true});
await mkdir(hostDraft);
const tar=spawnSync('docker',[...compose,'run','--no-deps','--rm','-T','api','tar','-C',`/data/publications/${draftId}`,'-cf','-','.'],{encoding:null});
if(tar.status)throw Error('Unable to read synthetic publication');
const extracted=spawnSync('tar',['-C',hostDraft,'-xf','-'],{input:tar.stdout});if(extracted.status)throw Error('Synthetic bundle extraction failed');
const bytes=await readFile(hostDraft+'/snapshot.json');
const publication=JSON.parse(bytes);
if(bytes.includes('PRIVATE-PHONE')||bytes.includes('PRIVATE-UNPUBLISHED')||bytes.includes(privateFile.id))throw Error('Private content leaked');
if(publication.media.length!==2 || !publication.members['modular-smoke'])throw Error('Public detail/media incomplete');
await approveBundle(hostDraft,sha256(bytes));
const publicRoot=resolve('data/rehearsal/cloud-'+draftId);
await activateBundle(hostDraft,publicRoot,'none');
await writeFile('data/rehearsal/latest.json',JSON.stringify({publicRoot,publicationId:publication.publicationId,photo:publication.media.find(m=>m.contentType==='image/png').path.split('/')[1],pdf:publication.media.find(m=>m.contentType==='application/pdf').path.split('/')[1]}));
console.log('Phase3 local core, sessions, private storage and publication smoke passed: 9 pages, member detail, 2 public media; unreferenced private file excluded');
