import {spawnSync} from 'node:child_process';import {readFile,stat} from 'node:fs/promises';import {resolve} from 'node:path';
const checks=[];
function check(name,condition){checks.push({name,passed:Boolean(condition)});}
for(const file of ['db_admin_password','db_migrator_password','db_app_password','session_secret','password_pepper','gateway_token','publication-signing.pem']){
 try{const s=await stat(resolve(process.env.RNAV_SECRETS_DIR??'',file));check('secret:'+file,s.isFile()&&(s.mode&0o077)===0&&(await readFile(resolve(process.env.RNAV_SECRETS_DIR??'',file),'utf8')).trim().length>=32);}catch{check('secret:'+file,false);}
}
const docker=spawnSync('docker',['info','--format','{{.MemTotal}}'],{encoding:'utf8'});check('docker>=6GiB',docker.status===0&&Number(docker.stdout)>6*1024**3);
if(process.platform==='darwin'){const p=spawnSync('pmset',['-g','custom'],{encoding:'utf8'}).stdout;check('mac-sleep-disabled',/\n\s+sleep\s+0\b/.test(p));check('power-recovery',/\n\s+autorestart\s+1\b/.test(p));}
console.log(JSON.stringify({scope:'Local preflight only; production approval, true-network and real-data gates are separate',checks},null,2));if(checks.some(x=>!x.passed))process.exitCode=1;
