// Verify approval and stage only approved files; an extra file in the source never leaves the Mac.
import {readFile,mkdir,copyFile} from 'node:fs/promises';import {join} from 'node:path';import {verify} from 'node:crypto';import {validateBundle,sha256,safeFile} from '@rnav/publication';
const [source,parent]=process.argv.slice(2);if(!source||!process.env.PUBLICATION_VERIFY_KEY_FILE)throw Error('Source and trusted verification key required');
const p=await validateBundle(source),approval=JSON.parse(await readFile(await safeFile(source,'approval.json'),'utf8'));const {signature,...review}=approval;
if(approval.sha256!==sha256(await readFile(await safeFile(source,'snapshot.json')))||!signature||!verify(null,Buffer.from(JSON.stringify(review)),await readFile(process.env.PUBLICATION_VERIFY_KEY_FILE),Buffer.from(signature,'base64')))throw Error('Unapproved package cannot leave this node');
if(parent){const target=join(parent,p.publicationId);await mkdir(target,{mode:0o700});await mkdir(join(target,'media'));for(const name of ['snapshot.json','approval.json',...p.media.map(m=>m.path)])await copyFile(await safeFile(source,name),join(target,name),1);}
console.log(p.publicationId);
