import 'dotenv/config';import pg from 'pg';
import {resolve} from 'node:path';
import {loadEnv} from '../../server/config/env.js';import {createCosGateway} from '../../server/services/media/cosGateway.js';import {transferObject,type MediaEntry} from './media-transfer.js';
const env=loadEnv(),apply=process.argv.includes('--apply');
if(apply&&process.env.MIGRATION_TARGET!=='isolated-or-authorized')throw Error('Apply requires explicit MIGRATION_TARGET=isolated-or-authorized and approved target configuration');
const pool=new pg.Pool({connectionString:env.databaseUrl});
try{
 const result=await pool.query<MediaEntry>("SELECT id,object_key,size_bytes,checksum_sha256,url FROM media_assets WHERE storage_provider='cos' ORDER BY id");
 const source=createCosGateway({secretId:env.cosSecretId,secretKey:env.cosSecretKey,region:env.cosRegion,bucket:env.cosBucket});
 const counts:Record<string,number>={};
 for(const row of result.rows){const transferred=await transferObject(row,source,resolve(env.storageRoot),apply);counts[transferred.status]=(counts[transferred.status]??0)+1;
   if(apply){const client=await pool.connect();try{await client.query('BEGIN');const changed=await client.query("UPDATE media_assets SET storage_provider='local',object_key=$1,updated_at=now() WHERE id=$2 AND storage_provider='cos' AND object_key=$3 AND checksum_sha256=$4",[transferred.key,row.id,row.object_key,row.checksum_sha256]);if(changed.rowCount!==1)throw Error('Concurrent media change; rerun inventory');const journal=await client.query("INSERT INTO storage_migration_journal(media_id,old_object_key,old_url,new_object_key,checksum_sha256) VALUES($1,$2,$3,$4,$5) ON CONFLICT(media_id) DO UPDATE SET new_object_key=EXCLUDED.new_object_key WHERE storage_migration_journal.checksum_sha256=EXCLUDED.checksum_sha256 AND storage_migration_journal.old_object_key=EXCLUDED.old_object_key",[row.id,row.object_key,row.url,transferred.key,row.checksum_sha256]);if(journal.rowCount!==1)throw Error('Conflicting migration journal; refusing commit');await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
 }
 console.log(JSON.stringify({dryRun:!apply,objects:result.rows.length,counts}));
}finally{await pool.end();}
