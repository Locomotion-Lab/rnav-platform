import { proxyInternalApi } from "@/lib/server/proxy";
async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const {path=[]}=await context.params;
  return proxyInternalApi(request,`/api/v1/${path.map(encodeURIComponent).join("/")}`,"内部服务暂时不可用");
}
export const GET=proxy;
export const POST=proxy;
export const PUT=proxy;
export const PATCH=proxy;
export const DELETE=proxy;
