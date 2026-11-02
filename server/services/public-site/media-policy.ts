export const ownedMediaOrigins = new Set([
  "https://r-navigation-1326672316.cos.ap-beijing.myqcloud.com",
  "https://liesmars.whu.edu.cn",
]);
// External scholarly PDFs remain links. Only repository media and registered objects are copied.
export function shouldCopyMedia(value: string, field: string, registered: boolean) {
  if (!value || !["src","href"].includes(field)) return false;
  if (/^\/(?:brand\/|og-default\.svg$)/.test(value)) return false;
  if (registered || value.startsWith("/api/media/files/")) return true;
  try { const url=new URL(value); return ownedMediaOrigins.has(url.origin) || (field === "src" && !/\.pdf$/i.test(url.pathname) && !(url.hostname === "arxiv.org" && url.pathname.startsWith("/pdf/"))); } catch { return field === "src"; }
}
