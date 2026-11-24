import { NextResponse, type NextRequest } from "next/server";
import { domainRoute } from "./lib/server/site-domains";

export function proxy(request: NextRequest) {
  const consoleOrigin = process.env.RNAV_CONSOLE_ORIGIN;
  const { pathname, search } = request.nextUrl;
  if (consoleOrigin) {
    const publicOrigin = process.env.RNAV_WEB_ORIGIN!;
    const host = request.headers.get("host")?.toLowerCase() ?? "";
    const action = domainRoute(host, pathname, new URL(publicOrigin).origin, new URL(consoleOrigin).origin);
    if (action.deny) return new NextResponse(null, { status: 404 });
    if (action.redirect) return NextResponse.redirect(action.redirect + search, 307);
  }
  if (pathname === "/console" || pathname.startsWith("/console/")) {
    const headers = new Headers(request.headers);
    headers.set("x-rnav-console-return", pathname + search);
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/console/:path*", "/login", "/admin/:path*", "/lab-assets", "/ai", "/api/:path*", "/directions/:path*", "/team/:path*", "/research/:path*", "/facilities/:path*", "/news/:path*", "/contact/:path*"],
};
