// Shared response boundary for independent Web -> API forwarding.
export async function proxyResponse(upstream: Response, method: string) {
  const headers = new Headers();
  for (const key of ["content-type", "cache-control", "content-disposition", "content-security-policy", "x-content-type-options"]) {
    const value = upstream.headers.get(key); if (value) headers.set(key,value);
  }
  for (const cookie of upstream.headers.getSetCookie()) headers.append("set-cookie",cookie);
  const body = method === "HEAD" || [204,205,304].includes(upstream.status) ? null : await upstream.arrayBuffer();
  return new Response(body,{status:upstream.status,headers});
}
