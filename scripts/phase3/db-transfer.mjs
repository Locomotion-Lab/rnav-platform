// Runs only against explicitly configured target. Never emits credentials or overwrites a database.
import {mkdir,open,readFile,writeFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import {join} from 'node:path';import {createHash} from 'node:crypto';import pg from 'pg';
const [operation,directory,...flags]=process.argv.slice(2);if(!['backup','restore'].includes(operation)||!directory)throw Error('Usage: db-transfer.mjs backup|restore DIRECTORY [--apply]');
const url=new URL(process.env.DATABASE_URL);const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};
if(!flags.includes('--apply')){console.log(JSON.stringify({dryRun:true,operation,host:url.hostname,database:env.PGDATABASE}));process.exit(0);}
if(process.env.MIGRATION_TARGET!=='isolated-or-authorized')throw Error('Apply requires explicit authorized target gate');
async function exec(command,args,stdio='inherit'){await new Promise((resolve,reject)=>{const child=spawn(command,args,{env,stdio});child.on('exit',code=>code===0?resolve():reject(Error('PostgreSQL tool failed; inspect private operator logs')));child.on('error',()=>reject(Error('PostgreSQL tool unavailable')));});}
if(operation==='backup'){
 await mkdir(directory,{mode:0o700});const archive=await open(join(directory,'database.dump'),'wx',0o600);try{await exec('pg_dump',['--format=custom','--no-password'],['ignore',archive.fd,'inherit']);}finally{await archive.close();}
 await exec('pg_restore',['--list',join(directory,'database.dump')],['ignore','ignore','inherit']);const bytes=await readFile(join(directory,'database.dump'));await writeFile(join(directory,'database.sha256'),createHash('sha256').update(bytes).digest('hex'),{flag:'wx',mode:0o600});
}else{
 const bytes=await readFile(join(directory,'database.dump'));let hash;try{hash=await readFile(join(directory,'database.sha256'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;hash=JSON.parse(await readFile(join(directory,'checksums.json'),'utf8'))['database.dump'];}if(typeof hash!=='string')throw Error('Missing archive checksum');if(createHash('sha256').update(bytes).digest('hex')!==hash.trim())throw Error('Archive checksum mismatch');
 const p=new pg.Pool({connectionString:process.env.DATABASE_URL});try{const r=await p.query("SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace)+(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace) objects");if(Number(r.rows[0].objects)!==0)throw Error('Restore target is not empty; refusing overwrite');}finally{await p.end();}
 await exec('pg_restore',['--exit-on-error','--single-transaction','--no-owner','--no-privileges','--dbname',env.PGDATABASE,join(directory,'database.dump')]);
}
console.log('PostgreSQL transfer completed; compare manifests before enabling writes');
