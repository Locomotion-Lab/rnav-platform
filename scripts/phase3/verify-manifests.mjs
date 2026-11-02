import {readFile} from 'node:fs/promises';
const [before,after]=process.argv.slice(2);if(!before||!after)throw Error('Two read-only manifests required');const a=JSON.parse(await readFile(before,'utf8')),b=JSON.parse(await readFile(after,'utf8'));
if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Database manifests differ; do not enable writes');console.log('All table counts, row fingerprints and migration checksums match');
