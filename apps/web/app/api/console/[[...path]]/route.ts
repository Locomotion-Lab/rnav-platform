import { proxyInternalApi } from "@/lib/server/proxy";
async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const {path=[]}=await context.params;
  return proxyInternalApi(request,`/api/console${path.length?`/${path.map(encodeURIComponent).join("/")}`:""}`,"内部服务暂时不可用");
}
export const GET=proxy;
