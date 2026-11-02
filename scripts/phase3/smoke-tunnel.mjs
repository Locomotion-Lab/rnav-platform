import {spawn,spawnSync} from 'node:child_process';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {randomBytes} from 'node:crypto';
const c=['compose','-p','rnav-phase3-rehearsal','-f','deploy/production/compose.mac.yaml'];
function d(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8'});if(r.status)throw Error('Isolated Docker step failed: '+r.stderr.slice(0,300));return r.stdout;}
const secretRoot=resolve(process.env.RNAV_SECRETS_DIR),m=JSON.parse(await readFile('data/phase3-latest.json','utf8'));
const directory=resolve('data/phase3-ssh-test');await mkdir(directory,{recursive:true,mode:0o700});
let keyExists=true;try{await readFile(join(directory,'id_ed25519.pub'));}catch{keyExists=false;}
if(!keyExists){const r=spawnSync('ssh-keygen',['-q','-t','ed25519','-N','','-f',join(directory,'id_ed25519')]);if(r.status)throw Error('Synthetic key generation');}
// Names are exclusive: do not remove or overwrite another running test.
d(['run','-d','--name','rnav-ssh-phase3','-p','127.0.0.1:12222:22','-p','127.0.0.1:13001:13000','rnav-ssh-rehearsal:phase3']);
d(['cp',join(directory,'id_ed25519.pub'),'rnav-ssh-phase3:/home/rnav-tunnel/.ssh/authorized_keys']);d(['exec','rnav-ssh-phase3','chown','-R','rnav-tunnel:rnav-tunnel','/home/rnav-tunnel/.ssh']);d(['exec','rnav-ssh-phase3','chmod','600','/home/rnav-tunnel/.ssh/authorized_keys']);
const hostKey=d(['exec','rnav-ssh-phase3','cat','/etc/ssh/ssh_host_ed25519_key.pub']).trim();await writeFile(join(directory,'known_hosts'),'[127.0.0.1]:12222 '+hostKey+'\n',{mode:0o600});
const args=['-F','/dev/null','-p','12222','-i',join(directory,'id_ed25519'),'-o','UserKnownHostsFile='+join(directory,'known_hosts'),'-o','StrictHostKeyChecking=yes','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=2','-o','ServerAliveCountMax=2'];
const target='rnav-tunnel@127.0.0.1';let tunnel;
function connect(){const child=spawn('ssh',[...args,'-NT','-R','127.0.0.1:14090:127.0.0.1:14090',target],{stdio:'ignore'});return child;}
async function waitHTTP(path,status){for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:13001'+path,{signal:AbortSignal.timeout(1500)});if(r.status===status)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('HTTP recovery timeout: '+path);}
try{
 tunnel=connect();
 d(['run','-d','--name','rnav-web-phase3','--network','container:rnav-ssh-phase3','--mount',`type=bind,src=${m.publicRoot},dst=/data/public,readonly`,'--mount',`type=bind,src=${secretRoot}/gateway_token,dst=/run/rnav-secrets/gateway_token,readonly`,'--mount',`type=bind,src=${secretRoot}/publication-verify.pem,dst=/run/rnav-secrets/publication-verify.pem,readonly`,'--env','PORT=13000','--env','GATEWAY_TOKEN_FILE=/run/rnav-secrets/gateway_token','--env','PUBLICATION_REQUIRE_SIGNATURE=true','--env','PUBLICATION_VERIFY_KEY_FILE=/run/rnav-secrets/publication-verify.pem','--env','RNAV_WEB_ORIGIN=http://127.0.0.1:13001','--env','RNAV_API_INTERNAL_URL=http://127.0.0.1:14090','--env','RNAV_API_TIMEOUT_MS=500','--entrypoint','node','rnav-web:phase3','apps/web/service-entry.mjs','node','apps/web/server.js']);
 await waitHTTP('/api/auth/session',401);
 const bad=spawnSync('ssh',[...args,'-NT','-R','127.0.0.1:15432:127.0.0.1:14090',target],{timeout:5000,encoding:'utf8'});if(bad.status===0||bad.error)throw Error('Restricted SSH forwarding did not fail immediately');
 const command=spawnSync('ssh',[...args,target,'true'],{timeout:5000,encoding:'utf8'});if(command.status===0||command.error)throw Error('Tunnel account obtained an exec session');
 const listeners=d(['exec','rnav-ssh-phase3','ss','-lnt']);if(!listeners.includes('127.0.0.1:14090')||listeners.includes('0.0.0.0:14090'))throw Error('API listener is not loopback only');
 const password=randomBytes(24).toString('hex');d([...c,'run','--no-deps','--rm','-T','migrate','node','--input-type=module','-e',`import pg from 'pg';import bcrypt from 'bcryptjs';const pass=await new Promise(r=>{let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>r(s))});const p=new pg.Pool({connectionString:process.env.DATABASE_URL});await p.query("UPDATE users SET username='modular-smoke',password_hash=$1 WHERE id='00000000-0000-4000-8000-00000000aa02'",[await bcrypt.hash(pass,12)]);await p.end();`],password);
 const base='http://127.0.0.1:13001';const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({username:'modular-smoke',password})});if(!login.ok)throw Error('SSH-backed BFF login '+login.status);const cookie=login.headers.get('set-cookie').split(';')[0];
 for(const path of ['/console','/api/profile','/api/console/dashboard','/api/notifications']){if((await fetch(base+path,{headers:{cookie}})).status!==200)throw Error('Core BFF unavailable '+path);}
 const denied=await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie,origin:'https://attacker.invalid','x-forwarded-host':'127.0.0.1:13001'}});if(denied.status!==403)throw Error('Forged origin accepted');
 const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie,origin:base}});if(logout.status!==204||!logout.headers.get('set-cookie')?.includes('Max-Age=0'))throw Error('Logout/session relay failed');
 tunnel.kill('SIGTERM');await new Promise(r=>setTimeout(r,300));await waitHTTP('/api/auth/session',503);
 d(['restart','rnav-web-phase3']);
 const snapshot=JSON.parse(await readFile(join(m.directory,'snapshot.json'),'utf8'));
 const png=snapshot.media.find(x=>x.contentType==='image/png');const optimized=png?`/_next/image?url=${encodeURIComponent(`/published-media/${m.publicationId}/${png.path.split('/')[1]}`)}&w=256&q=75`:'/api/public/bootstrap';
 for(const path of [optimized,'/','/directions','/team','/research','/facilities','/news','/contact','/api/public/team-members/modular-smoke',...snapshot.media.map(x=>`/published-media/${m.publicationId}/${x.path.split('/')[1]}`)])await waitHTTP(path,200);
 tunnel=connect();await waitHTTP('/api/auth/session',401);
 console.log('Isolated two-namespace SSH + Web + backend E2E passed: fixed-host-key reverse forwarding, rejected exec/other port, private loopback, cookies/CSRF, tunnel interruption 503, cold public content/media, reconnection recovery. This is not a Tencent-to-Mac WAN acceptance test.');
}finally{tunnel?.kill('SIGTERM');}
