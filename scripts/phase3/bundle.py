#!/usr/bin/env python3
"""Joint backup with writers stopped; exclusive restore to a NEW local directory.
Tar validation rejects traversal, links, device files and unrelated roots. No remote writes.
"""
import argparse,subprocess,pathlib,json,hashlib,tarfile,os,shutil
p=argparse.ArgumentParser();p.add_argument('operation',choices=['backup','restore']);p.add_argument('--directory',required=True);p.add_argument('--files-target');p.add_argument('--project',default='rnav-phase3-rehearsal');p.add_argument('--apply',action='store_true');a=p.parse_args()
root=pathlib.Path(a.directory).resolve()
if not a.apply:print(json.dumps({'dryRun':True,'operation':a.operation,'directory':str(root)}));raise SystemExit()
os.umask(0o077)
compose=['docker','compose','-p',a.project,'-f','deploy/production/compose.mac.yaml']
def run(args,**kwargs):return subprocess.run(args,check=True,**kwargs)
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
if a.operation=='backup':
 services=run(compose+['ps','--status','running','--services'],capture_output=True,text=True).stdout.splitlines()
 if any(s in ['api','job','migrate'] for s in services):raise SystemExit('Stop all writers and external scheduler first')
 root.mkdir(mode=0o700)
 with (root/'database.dump').open('xb') as out:run(compose+['exec','-T','db','pg_dump','-U','postgres','-d','rnav_platform','-Fc'],stdout=out)
 with (root/'database.dump').open('rb') as source:run(compose+['exec','-T','db','pg_restore','--list'],stdin=source,stdout=subprocess.DEVNULL)
 with (root/'files.tar').open('xb') as out:run(compose+['run','--no-deps','--rm','-T','api','tar','-C','/data','-cf','-','private-media','publications'],stdout=out)
 (root/'checksums.json').write_text(json.dumps({name:digest(root/name) for name in ['database.dump','files.tar']}))
else:
 checks=json.loads((root/'checksums.json').read_text())
 if set(checks)!={'database.dump','files.tar'}:raise SystemExit('Invalid checksum manifest')
 for name,expected in checks.items():
  if digest(root/name)!=expected:raise SystemExit('Backup checksum mismatch')
 target=pathlib.Path(a.files_target or '').resolve()
 if not a.files_target or target.exists():raise SystemExit('Explicit NEW files-target required; will not overwrite')
 with tarfile.open(root/'files.tar') as t:
  seen=set();total=0
  for item in t.getmembers():
   path=pathlib.PurePosixPath(item.name)
   if str(path) in seen:raise SystemExit('Duplicate tar member')
   seen.add(str(path));total+=item.size
   if len(seen)>100000 or total>shutil.disk_usage(target.parent).free-512*1024*1024:raise SystemExit('Unsafe tar size/file count')
   if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] not in ['private-media','publications'] or not(item.isfile() or item.isdir()):raise SystemExit('Unsafe tar member')
  target.mkdir(mode=0o700);t.extractall(target,filter='data')
print('Joint bundle verified; DB restore uses db-transfer.mjs against an empty target only')
