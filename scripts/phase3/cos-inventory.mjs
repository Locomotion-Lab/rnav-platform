// Run IN the authorized production repository only. Reads COS list metadata, never bodies/credentials out.
import 'dotenv/config';import COS from 'cos-nodejs-sdk-v5';import pg from 'pg';
const p=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{const c=await p.connect();await c.query('BEGIN READ ONLY');const rows=(await c.query('SELECT object_key FROM media_assets')).rows;await c.query('COMMIT');c.release();const refs=new Set(rows.map(x=>x.object_key));
const cos=new COS({SecretId:process.env.COS_SECRET_ID,SecretKey:process.env.COS_SECRET_KEY,Timeout:15000});let marker='',objects=0,bytes=0,matches=0,pages=0;
do{const result=await new Promise((ok,no)=>cos.getBucket({Bucket:process.env.COS_BUCKET,Region:process.env.COS_REGION,Marker:marker,MaxKeys:1000},(e,d)=>e?no(Error('COS metadata request failed')):ok(d)));for(const item of result.Contents??[]){objects++;bytes+=Number(item.Size);if(refs.has(item.Key))matches++;}marker=result.IsTruncated==='true'?result.NextMarker:'';if(++pages>100)throw Error('Inventory page limit reached');}while(marker);
console.log(JSON.stringify({objects,bytes,registered:refs.size,matched:matches,missing:refs.size-matches}));}finally{await p.end();}
