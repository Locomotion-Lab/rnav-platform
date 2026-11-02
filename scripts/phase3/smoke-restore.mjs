import {spawnSync} from 'node:child_process';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {resolve,join} from 'node:path';
const env={...process.env},file='deploy/production/compose.mac.yaml';
function run(command,args,options={}){const r=spawnSync(command,args,{env,encoding:'utf8',...options});if(r.status)throw Error('Restore rehearsal step failed: '+r.stderr?.slice(0,500));return r.stdout;}
function compose(project,args,options){return run('docker',['compose','-p',project,'-f',file,...args],options);}
const source='rnav-phase3-rehearsal',target='rnav-phase3-restore-'+Date.now();
compose(source,['stop','api']);
const before=compose(source,['run','--no-deps','--rm','-T','migrate','node','scripts/phase3/db-manifest.mjs']);await writeFile('data/phase3-manifest-before.json',before,{mode:0o600});
await mkdir('backups/phase3-joint',{recursive:true});const name='joint-'+Date.now(),directory=resolve('backups/phase3-joint',name);
run('python3',['scripts/phase3/bundle.py','backup','--project',source,'--directory',directory,'--apply']);
// The target is a separate, previously nonexistent Compose project/volume set; no reset or DROP.
compose(target,['up','--no-build','-d','--wait','db']);env.RNAV_BACKUP_DIR=resolve('backups/phase3-joint');
compose(target,['--profile','maintenance','run','--no-deps','--rm','-T','dbtools','node','scripts/phase3/db-transfer.mjs','restore','/backups/'+name,'--apply']);
const after=compose(target,['run','--no-deps','--rm','-T','migrate','node','scripts/phase3/db-manifest.mjs']);await writeFile('data/phase3-manifest-after.json',after,{mode:0o600});
run('node',['scripts/phase3/verify-manifests.mjs','data/phase3-manifest-before.json','data/phase3-manifest-after.json']);
const archive=await readFile(join(directory,'files.tar'));
compose(target,['run','--no-deps','--rm','-T','api','tar','-C','/data','-xf','-'],{input:archive});
const expected=compose(target,['run','--no-deps','--rm','-T','migrate','node','--input-type=module','-e',`import pg from 'pg';const p=new pg.Pool({connectionString:process.env.DATABASE_URL});console.log(JSON.stringify((await p.query("SELECT object_key,checksum_sha256 FROM media_assets WHERE storage_provider='local'")).rows));await p.end();`]);
compose(target,['run','--no-deps','--rm','-T','api','node','--input-type=module','-e',`import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';const rows=JSON.parse(await new Promise(r=>{let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>r(s))}));for(const row of rows){const b=await readFile('/data/private-media/'+row.object_key);if(createHash('sha256').update(b).digest('hex')!==row.checksum_sha256)throw Error('Restored media mismatch');}console.log('Restored local media hashes verified');`],{input:expected});
compose(target,['run','--no-deps','--rm','-T','migrate','node','scripts/phase3/grant-app.mjs']);
// Production is frozen by default; restored API must reject write attempts before activation.
env.RNAV_MAC_API_PORT='24090';env.BACKEND_WRITE_ENABLED='false';
compose(target,['up','--no-build','-d','--wait','api']);
const token=(await readFile(join(env.RNAV_SECRETS_DIR,'gateway_token'),'utf8')).trim();
const response=await fetch('http://127.0.0.1:24090/api/v1/auth/login',{method:'POST',headers:{'x-rnav-gateway-token':token,'content-type':'application/json'},body:'{}'});if(response.status!==503)throw Error('Restored node enabled writes too soon');
compose(target,['stop']);
await writeFile('data/phase3-backup-latest.json',JSON.stringify({directory,target}));
console.log('Joint restore E2E passed: independent PG14 cluster, all table fingerprints/counts/45 migration checksums equal, all local media hashes match, app DML roles restored, default write freeze503; original volumes preserved');
