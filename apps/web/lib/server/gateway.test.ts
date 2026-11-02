import test from 'node:test';import assert from 'node:assert/strict';import {gatewayHeaders,proxyBody} from './gateway.ts';
test('gateway authentication cannot be supplied by a browser and chunked uploads are bounded',async()=>{
 const old=process.env.GATEWAY_TOKEN;process.env.GATEWAY_TOKEN='trusted-secret-for-test';
 try{assert.equal(gatewayHeaders({'x-rnav-gateway-token':'attacker'}).get('x-rnav-gateway-token'),'trusted-secret-for-test');}finally{if(old===undefined)delete process.env.GATEWAY_TOKEN;else process.env.GATEWAY_TOKEN=old;}
 await assert.rejects(proxyBody(new Request('https://example.com',{method:'POST',body:'12345'}),4),/PROXY_BODY_LIMIT/);
});
