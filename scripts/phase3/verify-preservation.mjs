import {readFile} from 'node:fs/promises';
const [before,after]=process.argv.slice(2);if(!before||!after)throw Error('Baseline and post-transform manifests required');const a=JSON.parse(await readFile(before,'utf8')),b=JSON.parse(await readFile(after,'utf8'));
const allowed=new Set(['schema_migrations','permissions','media_assets','storage_migration_journal']);
for(const [table,row]of Object.entries(a.tables)){
 const newer=b.tables[table];if(!newer)throw Error('Table lost: '+table);
 if(!allowed.has(table)&&JSON.stringify(row)!==JSON.stringify(newer))throw Error('Unexpected core/history change: '+table);
 if(table==='media_assets'&&row.count!==newer.count)throw Error('Media count changed');
}
console.log('All non-transformed core/history tables unchanged; inspect explicit migration/permission/media journal transformations separately');
