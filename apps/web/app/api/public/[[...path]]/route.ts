import { readPublished } from "@/lib/server/publication";
import { proxyInternalApi } from "@/lib/server/proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  if (process.env.RNAV_PUBLIC_SOURCE !== "snapshot") return proxyInternalApi(request, `/api/public/${path.map(encodeURIComponent).join("/")}`, "公开数据暂时不可用");
  try {
    const data = await readPublished(path.join("/"));
    return data == null ? Response.json({ error:"Not found" },{status:404}) : Response.json(data,{headers:{"Cache-Control":"no-store"}});
  } catch { return Response.json({error:"Public snapshot unavailable"},{status:503}); }
}
