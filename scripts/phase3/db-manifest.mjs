import pg from 'pg';import {writeFile} from 'node:fs/promises';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='60s'");await client.query("SET LOCAL TIME ZONE 'UTC'");await client.query("SET LOCAL datestyle='ISO, YMD'");
const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;const manifest={version:1,tables:{},migrations:[]};
for(const {tablename} of tables){if(!/^[a-z_0-9]+$/.test(tablename))throw Error('Unexpected identifier');const r=await client.query(`SELECT count(*)::text count,md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text) COLLATE \"C\"),'')) fingerprint FROM public."${tablename}" t`);manifest.tables[tablename]=r.rows[0];}
manifest.migrations=(await client.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;await client.query('COMMIT');
const output=process.argv[2];if(output)await writeFile(output,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});else console.log(JSON.stringify(manifest));
}finally{client.release();await pool.end();}
