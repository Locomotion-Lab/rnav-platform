import {spawnSync} from 'node:child_process';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';import {randomBytes} from 'node:crypto';import {approveBundle,activateBundle,sha256,readCurrent} from '@rnav/publication';
const c=['compose','-p','rnav-phase3-rehearsal','-f','deploy/production/compose.mac.yaml'];
const token=(await readFile(process.env.RNAV_SECRETS_DIR+'/gateway_token','utf8')).trim();
function d(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8'});if(r.status)throw Error('Docker step failed: '+r.stderr.slice(0,500));return r.stdout;}
function setup(script,input=''){return d([...c,'run','--no-deps','--rm','-T','migrate','node','--input-type=module','-e',script],input);}
const password=randomBytes(24).toString('hex');
setup(`import pg from 'pg';import bcrypt from 'bcryptjs';const pass=await new Promise(r=>{let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>r(s))});const p=new pg.Pool({connectionString:process.env.DATABASE_URL});await p.query("UPDATE users SET username='modular-smoke',password_hash=$1 WHERE id='00000000-0000-4000-8000-00000000aa02'",[await bcrypt.hash(pass,12)]);await p.query("INSERT INTO research_item_links(research_item_id,label_zh,label_en,href) VALUES('modular-smoke-paper','论文','arXiv','https://arxiv.org/pdf/2601.12345.pdf')");await p.end();`,password);
const base='http://127.0.0.1:14090';const h={'x-rnav-gateway-token':token,'content-type':'application/json',origin:base,'x-forwarded-host':'127.0.0.1:14090','x-forwarded-proto':'http'};
if((await fetch(base+'/api/v1/profile',{headers:{'x-forwarded-host':'trusted'}})).status!==403)throw Error('Gateway bypass');
let r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:h,body:JSON.stringify({username:'modular-smoke',password})});if(!r.ok)throw Error('Login');h.cookie=r.headers.get('set-cookie').split(';')[0];
// Round-trip a full schema-checked member profile update using the actual service response.
r=await fetch(base+'/api/v1/profile',{headers:h});const profile=await r.json();
const fields=['version','nameZh','nameEn','publicEmail','phone','bioZh','bioEn','researchInterestsZh','researchInterestsEn','enrollmentYear','graduationYear','majorZh','majorEn','thesisZh','thesisEn','destinationZh','destinationEn','avatarAssetId','avatarPositionX','avatarPositionY','avatarZoom','personalLinks','publicFields'];
const update=Object.fromEntries(fields.map(k=>[k,profile[k]]));update.bioZh='Phase3 synthetic profile update';update.nameZh='张三';update.nameEn='San-Zhang';
r=await fetch(base+'/api/v1/profile',{method:'PUT',headers:h,body:JSON.stringify(update)});if(!r.ok)throw Error('Profile update '+r.status+' '+await r.text());
const forbidden=await fetch(base+'/api/v1/profile',{method:'PUT',headers:{...h,origin:'https://attacker.invalid'},body:JSON.stringify(update)});if(forbidden.status!==403)throw Error('CSRF allowed');
// File lifecycle and content-type spoofing through real storage/API.
const listed=await (await fetch(base+'/api/v1/media',{headers:h})).json();const privateAsset=listed.assets.find(x=>x.filename==='private.pdf');if(!privateAsset)throw Error('Missing unreferenced synthetic file');
for(const action of ['recycle','restore']){const result=await fetch(base+'/api/v1/media/'+privateAsset.id+'/'+action,{method:'POST',headers:h,body:'{}'});if(!result.ok)throw Error('File lifecycle '+action);const read=await fetch(base+privateAsset.url,{headers:h});if(read.status!==(action==='recycle'?404:200))throw Error('File lifecycle read mismatch');}
const spoof=new FormData();spoof.set('file',new Blob([Buffer.from('%PDF-FAKE')],{type:'image/png'}),'spoof.png');const spoofed=await fetch(base+'/api/v1/media/upload',{method:'POST',headers:{cookie:h.cookie,origin:base,'x-rnav-gateway-token':token,'x-forwarded-host':'127.0.0.1:14090','x-forwarded-proto':'http'},body:spoof});if(spoofed.status!==400)throw Error('Content-type spoof accepted');
// A different ordinary member cannot read another private file, attach its image, or approve releases.
setup(`import pg from 'pg';const p=new pg.Pool({connectionString:process.env.DATABASE_URL});await p.query("INSERT INTO users(id,username,display_name,password_hash,base_tier,status,must_change_password,account_kind) SELECT '00000000-0000-4000-8000-00000000bb04','private-other','Private other',password_hash,'normal','active',false,'person' FROM users WHERE id='00000000-0000-4000-8000-00000000aa02' ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,password_hash=EXCLUDED.password_hash");await p.query("INSERT INTO user_profiles(user_id,name_zh,name_en,degree_level,member_slug) VALUES('00000000-0000-4000-8000-00000000bb04','李四','Si-Li','phd','private-other') ON CONFLICT(user_id) DO NOTHING");await p.end();`);
const otherLogin=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:h,body:JSON.stringify({username:'private-other',password})});if(!otherLogin.ok)throw Error('Ordinary member login failed');const other={...h,cookie:otherLogin.headers.get('set-cookie').split(';')[0]};
if((await fetch(base+privateAsset.url,{headers:other})).status!==404)throw Error('Other member read private file');
const otherProfile=await (await fetch(base+'/api/v1/profile',{headers:other})).json();const stolen=Object.fromEntries(fields.map(k=>[k,otherProfile[k]]));stolen.avatarAssetId=profile.avatarAssetId;const attached=await fetch(base+'/api/v1/profile',{method:'PUT',headers:other,body:JSON.stringify(stolen)});if(attached.status!==400)throw Error('Other member attached an unowned image');
if((await fetch(base+'/api/v1/publications/prepare',{method:'POST',headers:other,body:'{}'})).status!==403)throw Error('Ordinary member prepared a public release');
// Device type and asset creation/modification/publication through real versioned APIs.
const snapshot=async()=>{const x=await fetch(base+'/api/v1/lab-assets',{headers:h});return x.json();};
let s=await snapshot();
if(!s.deviceTypes.some(x=>x.code==='phase3-type')){r=await fetch(base+'/api/v1/lab-assets/device-types',{method:'POST',headers:h,body:JSON.stringify({code:'phase3-type',name:'演练设备类型',expectedRevision:s.revision})});if(!r.ok)throw Error('Device type '+r.status);}
s=await snapshot();
const asset={code:'PHASE3-ASSET',deviceTypeCode:'phase3-type',model:'Synthetic',name:{zh:'演练设备',en:'Synthetic device'},description:{zh:'演练',en:'Test'},vendorSerial:'PRIVATE-SERIAL',status:'idle',currentPlatformCode:null,assignedUserId:null,borrowerName:'',borrowerContact:'PRIVATE-BORROWER',storageLocation:'isolated',publicProfile:{publicVisible:true,title:{zh:'公开演练设备',en:'Public device'},description:{zh:'公开说明',en:'Public details'},imageAssetId:profile.avatarAssetId,sortOrder:0},expectedRevision:s.revision};
r=await fetch(base+'/api/v1/lab-assets/assets'+(s.assets.some(x=>x.code===asset.code)?'/'+asset.code:''),{method:s.assets.some(x=>x.code===asset.code)?'PUT':'POST',headers:h,body:JSON.stringify(asset)});if(!r.ok)throw Error('Asset write '+r.status);
r=await fetch(base+'/api/v1/publications/prepare',{method:'POST',headers:h,body:'{}'});if(!r.ok)throw Error('Prepare '+r.status);const prepared=await r.json();
r=await fetch(base+'/api/v1/publications/'+prepared.id,{headers:h});const review=await r.json();const serialized=JSON.stringify(review.publication);
if(!serialized.includes('https://arxiv.org/pdf/2601.12345.pdf')||!serialized.includes('公开演练设备')||/PRIVATE-SERIAL|PRIVATE-BORROWER|PRIVATE-PHONE/.test(serialized))throw Error('Publication privacy/links regression');
r=await fetch(base+'/api/v1/publications/'+prepared.id+'/approve',{method:'POST',headers:h,body:JSON.stringify({sha256:review.sha256})});if(!r.ok)throw Error('Approval '+r.status);
const directory=resolve('data/phase3-approved-'+prepared.id);await mkdir(directory);
const tar=spawnSync('docker',[...c,'run','--no-deps','--rm','-T','api','tar','-C','/data/publications/'+prepared.id,'-cf','-','.']);if(tar.status)throw Error('Bundle copy');const extracted=spawnSync('tar',['-C',directory,'-xf','-'],{input:tar.stdout});if(extracted.status)throw Error('Bundle extract');
const publicRoot=resolve('data/phase3-cloud');
let expected='none';try{expected=(await readCurrent(publicRoot)).publicationId;}catch(e){if(e.code!=='ENOENT')throw e;}
await activateBundle(directory,publicRoot,expected,{requireSignature:true,publicKey:await readFile(process.env.RNAV_SECRETS_DIR+'/publication-verify.pem','utf8')});
await writeFile('data/phase3-latest.json',JSON.stringify({publicRoot,directory,publicationId:prepared.publicationId}));
console.log('Phase3 real API synthetic E2E: gateway, member update, CSRF denial, device creation/update/public profile, external arXiv link, signed permission-controlled review and activation passed');
