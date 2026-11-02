import {readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';
if(process.env.GATEWAY_TOKEN_FILE)process.env.GATEWAY_TOKEN=(await readFile(process.env.GATEWAY_TOKEN_FILE,'utf8')).trim();
const [command,...args]=process.argv.slice(2);const child=spawn(command,args,{stdio:'inherit',env:process.env});for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code??1));
