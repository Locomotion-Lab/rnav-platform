import {readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';
for(const key of ['SESSION_SECRET','PASSWORD_PEPPER','GATEWAY_TOKEN','COS_SECRET_ID','COS_SECRET_KEY']) if(process.env[key+'_FILE'])process.env[key]=(await readFile(process.env[key+'_FILE'],'utf8')).trim();
if(process.env.DATABASE_PASSWORD_FILE){const password=(await readFile(process.env.DATABASE_PASSWORD_FILE,'utf8')).trim();process.env.DATABASE_URL=`postgres://${encodeURIComponent(process.env.DATABASE_ROLE)}:${encodeURIComponent(password)}@${process.env.DATABASE_HOST??'db'}:5432/rnav_platform`;}
const [command,...args]=process.argv.slice(2);if(!command)throw Error('Explicit command required');
const child=spawn(command,args,{stdio:'inherit',env:process.env});for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code??1));
