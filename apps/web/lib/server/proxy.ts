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
  const incoming = getRequestOrigin(request);
  const origin = request.headers.get("origin");
  if (!readMethods.has(request.method.toUpperCase()) && origin !== incoming.origin) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const headers = new Headers();
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
      body: readMethods.has(request.method.toUpperCase()) ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    return proxyResponse(upstream,request.method);
  } catch {
    return NextResponse.json({ error: unavailableMessage }, { status: 503 });
  }
}
