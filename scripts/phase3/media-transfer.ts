import {createReadStream} from "node:fs";
import {createHash} from 'node:crypto';
import {mkdir,open,stat,readFile,writeFile,link,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {safeFile} from '@rnav/publication';
export type MediaEntry={id:string;object_key:string;size_bytes:string|number;checksum_sha256:string;url:string};
export type ObjectSource={headObject(key:string):Promise<{size:number;etag:string}>;readRange(key:string,start:number,end:number):Promise<Buffer>};
async function hashFile(path:string){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
export async function transferObject(entry:MediaEntry,source:ObjectSource,root:string,apply=false) {
  const hash=entry.checksum_sha256;
  if(!/^[a-f0-9]{64}$/.test(hash)||!Number.isSafeInteger(Number(entry.size_bytes))||Number(entry.size_bytes)<1)throw Error('Missing trustworthy media checksum/size');
  const key=`migrated/${hash}`,target=join(root,key);
  try {const path=await safeFile(root,key);if((await stat(path)).size!==Number(entry.size_bytes)||await hashFile(path)!==hash)throw Error('Existing media differs; refusing overwrite');return {key,status:'verified-existing'};}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const head=await source.headObject(entry.object_key);
  if(head.size!==Number(entry.size_bytes)||!head.etag)throw Error('Source size/identity mismatch');
  if(!apply)return{key,status:'would-copy',bytes:head.size};
  await mkdir(join(root,'migrated'),{recursive:true});await safeFile(root,'migrated');
  const partial=target+'.partial',metadata=partial+'.json';
  const identity=JSON.stringify({size:head.size,etag:head.etag,sha256:hash});
  try{if(await readFile(metadata,'utf8')!==identity)throw Error('Partial belongs to changed source');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await writeFile(metadata,identity,{flag:'wx',mode:0o600});}
  let offset=0;try{offset=(await stat(await safeFile(root,key+'.partial'))).size;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(offset>head.size)throw Error('Invalid partial size');
  const file=await open(partial,'a',0o600);
  try{
    while(offset<head.size){const end=Math.min(head.size-1,offset+1024*1024-1);let bytes:Buffer|undefined;
      for(let attempt=0;attempt<3;attempt++){try{bytes=await source.readRange(entry.object_key,offset,end);break;}catch{if(attempt===2)throw Error('Object transfer failed after 3 retries; partial retained');}}
      if(!bytes||bytes.length!==end-offset+1)throw Error('Invalid ranged response');await file.write(bytes);await file.sync();offset+=bytes.length;
    }
  }finally{await file.close();}
  const after=await source.headObject(entry.object_key);if(after.etag!==head.etag||after.size!==head.size)throw Error('Source changed during transfer');
  if(await hashFile(partial)!==hash)throw Error('SHA-256 mismatch; target not published');
  // Hard-link exclusively publishes a complete object without overwriting another process's target.
  try{await link(partial,target);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;if(await hashFile(await safeFile(root,key))!==hash)throw Error('Concurrent target mismatch');}
  await unlink(partial);await unlink(metadata);
  return {key,status:'copied',bytes:head.size};
}
