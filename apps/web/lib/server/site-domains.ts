const inPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);
const publicPages = ["/directions", "/team", "/research", "/facilities", "/news", "/contact"];

export function domainRoute(host: string, pathname: string, publicOrigin: string, consoleOrigin: string) {
  const isConsole = host === new URL(consoleOrigin).host;
  if (!isConsole && host !== new URL(publicOrigin).host) return { deny: true };
  const publicApi = inPath(pathname, "/api/public") || inPath(pathname, "/api/v1/public");
  if (inPath(pathname, "/api")) return { deny: !isConsole && !publicApi };
  if (isConsole && pathname === "/") return { redirect: `${consoleOrigin}/console` };
  if (isConsole && publicPages.some((page) => inPath(pathname, page))) return { redirect: publicOrigin + pathname };
  if (pathname === "/admin" || pathname === "/admin/dashboard") return { redirect: `${consoleOrigin}/console/site` };
  if (pathname === "/lab-assets") return { redirect: `${consoleOrigin}/console/lab-assets` };
  if (pathname === "/ai") return { redirect: `${consoleOrigin}/console/assistant` };
  if (!isConsole && (inPath(pathname, "/console") || pathname === "/login")) return { redirect: consoleOrigin + pathname };
  return { deny: false };
}
