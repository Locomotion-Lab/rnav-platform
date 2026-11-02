import { proxyResponse } from "@/lib/server/proxy-response";
import { NextResponse } from "next/server";
import { getInternalApiUrl } from "@/lib/server/api";
import { createUpstreamHeaders, validateIncomingOrigin } from "./proxy";

async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const originRejection = validateIncomingOrigin(request); if (originRejection) return originRejection;
  const { path = [] } = await context.params; const incomingUrl = new URL(request.url);
  const upstreamUrl = getInternalApiUrl(`/api/scholarly-sync/${path.join("/")}${incomingUrl.search}`);
  try {
    const upstream = await fetch(upstreamUrl, { method: request.method, headers: createUpstreamHeaders(request), body: ["GET", "HEAD"].includes(request.method.toUpperCase()) ? undefined : await request.arrayBuffer(), signal: AbortSignal.timeout(15000), cache: "no-store" });
    return proxyResponse(upstream,request.method);
  } catch { return NextResponse.json({ error: "Scholarly sync service unavailable" }, { status: 502 }); }
}
export const GET = proxy; export const POST = proxy; export const PATCH = proxy;
