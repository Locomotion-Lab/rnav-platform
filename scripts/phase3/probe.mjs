// Exit status suitable for launchd/systemd/heartbeat; no secrets or response bodies logged.
const base=process.argv[2]??'http://127.0.0.1:14090';
if(!/^https?:\/\//.test(base))throw Error('HTTP origin required');
try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(5000),redirect:'error'});const body=await r.json();if(!r.ok||body.database!=='ok')throw Error();console.log('RNAV health ok');}catch{console.error('RNAV health unavailable: investigate engine, backend and tunnel; public snapshot remains independent');process.exitCode=1;}
