export function gatewayHeaders(source?:HeadersInit) {
  const headers=new Headers(source);headers.delete('x-rnav-gateway-token');
  if(process.env.GATEWAY_TOKEN)headers.set('x-rnav-gateway-token',process.env.GATEWAY_TOKEN);
  return headers;
}
export async function proxyBody(request:Request,max=22*1024*1024){
 if(!request.body)return undefined;
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>max){await reader.cancel();throw new Error('PROXY_BODY_LIMIT');}chunks.push(item.value);}}
 finally{reader.releaseLock();}
 const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}return body;
}
