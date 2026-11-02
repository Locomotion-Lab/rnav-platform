import {proxyInternalApi} from "@/lib/server/proxy";
async function proxy(request:Request,context:{params:Promise<{path?:string[]}>}){
 const {path=[]}=await context.params;
 return proxyInternalApi(request,`/api/site-admin${path.length?`/${path.map(encodeURIComponent).join("/")}`:""}`,"Internal service unavailable");
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
