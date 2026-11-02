// Generates only local deployment secrets into a NEW directory, never overwrites existing values.
import {mkdir,writeFile,readFile} from 'node:fs/promises';import {randomBytes,generateKeyPairSync} from 'node:crypto';import {resolve,join} from 'node:path';
const directory=resolve(process.argv[2]??'data/phase3-secrets');
const legacyPath=process.argv.find(x=>x.startsWith('--legacy-env='))?.slice(13);
const legacy=legacyPath?(await import('dotenv')).parse(await readFile(legacyPath)):{};
if(legacyPath&&(!legacy.SESSION_SECRET||legacy.SESSION_SECRET.length<32||!legacy.PASSWORD_PEPPER))throw Error('Legacy secret import incomplete');
await mkdir(directory,{mode:0o700});
for(const key of ['db_admin_password','db_migrator_password','db_app_password','session_secret','password_pepper','gateway_token'])await writeFile(join(directory,key),legacy[key.toUpperCase()]??randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
for(const name of ['COS_SECRET_ID','COS_SECRET_KEY'])await writeFile(join(directory,name.toLowerCase()),legacy[name]??'',{flag:'wx',mode:0o600});
const keys=generateKeyPairSync('ed25519');await writeFile(join(directory,'publication-signing.pem'),keys.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});await writeFile(join(directory,'publication-verify.pem'),keys.publicKey.export({type:'spki',format:'pem'}),{flag:'wx',mode:0o644});
console.log('New local secrets generated; values not printed. Production SESSION_SECRET must be preserved from authorized secure transfer, never regenerated.');
