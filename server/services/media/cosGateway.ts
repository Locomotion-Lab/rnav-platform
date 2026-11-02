import COS from "cos-nodejs-sdk-v5";
export type CosGateway = {
  putObject(input:{key:string;body:Buffer;contentType:string}):Promise<void>;
  deleteObject(key:string):Promise<void>;
  getObject(key:string):Promise<Buffer>;
  headObject(key:string):Promise<{size:number;etag:string}>;
  readRange(key:string,start:number,end:number):Promise<Buffer>;
};
export function createCosGateway(options:{secretId?:string;secretKey?:string;region?:string;bucket?:string;domain?:string;protocol?:"http:"|"https:"}):CosGateway {
  const unavailable=async():Promise<never>=>{throw new Error("COS is not configured");};
  if(!options.secretId||!options.secretKey||!options.region||!options.bucket) return {putObject:unavailable,deleteObject:unavailable,getObject:unavailable,headObject:unavailable,readRange:unavailable};
  const client=new COS({SecretId:options.secretId,SecretKey:options.secretKey,Timeout:15000,Domain:options.domain,Protocol:options.protocol});
  const base={Bucket:options.bucket,Region:options.region};
  const read=async(key:string,range?:string)=>new Promise<Buffer>((resolve,reject)=>{
    client.getObject({...base,Key:key,...(range?{Range:range}:{})},(error,data)=>error?reject(new Error(`COS read failed (${error.statusCode ?? 'network'})`)):resolve(Buffer.isBuffer(data.Body)?data.Body:Buffer.from(data.Body as string)));
  });
  return {
    putObject:input=>new Promise((resolve,reject)=>client.putObject({...base,Key:input.key,Body:input.body,ContentType:input.contentType},error=>error?reject(new Error("COS write failed")):resolve())),
    deleteObject:key=>new Promise((resolve,reject)=>client.deleteObject({...base,Key:key},error=>error?reject(new Error("COS delete failed")):resolve())),
    getObject:key=>read(key),
    headObject:key=>new Promise((resolve,reject)=>client.headObject({...base,Key:key},(error,data)=>error?reject(new Error("COS HEAD failed")):resolve({size:Number(data.headers?.['content-length']),etag:String(data.headers?.etag??'')}))),
    readRange:(key,start,end)=>read(key,`bytes=${start}-${end}`),
  };
}
