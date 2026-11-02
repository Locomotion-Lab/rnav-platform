import { gatewayHeaders,proxyBody } from "./gateway";
import { getRequestOrigin } from "./request-origin";
import { proxyResponse } from "./proxy-response";
import { NextResponse } from "next/server";
import { getInternalApiUrl } from "./api";

const readMethods = new Set(["GET", "HEAD"]);

export async function proxyInternalApi(
  request: Request,
  upstreamPath: string,
  unavailableMessage: string,
) {
  let incoming: URL;
  try { incoming=getRequestOrigin(request); } catch {return NextResponse.json({code:"ORIGIN_DENIED",error:"Forbidden host"},{status:403});}
  const origin = request.headers.get("origin");
  if (!readMethods.has(request.method.toUpperCase()) && origin !== incoming.origin) {
    return NextResponse.json({ code:"ORIGIN_DENIED", error: "Forbidden origin" }, { status: 403 });
  }

  const headers = gatewayHeaders();
  for (const name of ["accept", "content-type", "cookie"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("host", incoming.host);
  headers.set("origin", incoming.origin);
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.slice(0, -1));

  try {
    const upstream = await fetch(getInternalApiUrl(`${upstreamPath}${new URL(request.url).search}`), {
      method: request.method,
      headers,
      body: readMethods.has(request.method.toUpperCase()) ? undefined : await proxyBody(request),
      cache: "no-store", redirect:"error",
      signal: AbortSignal.timeout(Math.max(100,Math.min(15000,Number(process.env.RNAV_API_TIMEOUT_MS)||15000))),
    });
    return proxyResponse(upstream,request.method);
  } catch(error) {
    return NextResponse.json({ code:error instanceof Error && error.message === "PROXY_BODY_LIMIT" ? "PAYLOAD_TOO_LARGE" : "UPSTREAM_UNAVAILABLE", error: error instanceof Error && error.message === "PROXY_BODY_LIMIT" ? "File too large" : unavailableMessage }, { status: error instanceof Error && error.message === "PROXY_BODY_LIMIT" ? 413 : 503 });
  }
}
