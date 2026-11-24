// Next standalone may construct request.url using its internal listen address.
// Prefer an operator-configured public origin; never trust client-supplied forwarded headers here.
export function getRequestOrigin(request: Request) {
  const publicOrigin = process.env.RNAV_WEB_ORIGIN;
  const consoleOrigin = process.env.RNAV_CONSOLE_ORIGIN;
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") ?? requestUrl.host;
  if (/[\s/@\\#?,]/.test(host)) throw new Error("Invalid request host");
  const configured = consoleOrigin
    ? [publicOrigin, consoleOrigin].find((value) => value && new URL(value).host === host.toLowerCase())
    : publicOrigin;
  if (consoleOrigin && !configured) throw new Error("Unrecognized request host");
  const origin = new URL(configured ?? `${requestUrl.protocol}//${host}`);
  if (!["http:","https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Invalid public origin");
  return origin;
}
