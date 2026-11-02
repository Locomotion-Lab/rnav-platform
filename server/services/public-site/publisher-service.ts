import {readFile,mkdir} from 'node:fs/promises';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';import {sha256,validateBundle,approveBundle,safeFile} from '@rnav/publication';
import {preparePublication} from './publication.js';import type {StorageProvider} from '../storage/provider.js';
export function createPublisherService(pool:Pool,storage:StorageProvider,options:{root:string;signingKey?:string}) {
 const dir=(id:string)=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid publication ID');return join(options.root,id);};
 const audit=(actor:string,action:string,id:string,detail:unknown)=>pool.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,$2,'publication',$3,$4::jsonb)",[actor,action,id,JSON.stringify(detail)]);
 return {
  async prepare(actor:string){await mkdir(options.root,{recursive:true});const id=randomUUID();const result=await preparePublication(pool,storage,dir(id));await audit(actor,'publication.prepare',id,result);return {id,...result};},
  async review(id:string){const publication=await validateBundle(dir(id));return {id,sha256:sha256(await readFile(await safeFile(dir(id),'snapshot.json'))),publication};},
  async approve(id:string,hash:string,actor:string){const directory=dir(id);await validateBundle(directory);await audit(actor,'publication.approve.requested',id,{sha256:hash});const privateKey=options.signingKey?await readFile(options.signingKey,'utf8'):undefined;if(!privateKey)throw Error('Publication signing key is required');await approveBundle(directory,hash,{actor,privateKey});await audit(actor,'publication.approved',id,{sha256:hash});return{id,sha256:hash,approved:true};}
 };
}
