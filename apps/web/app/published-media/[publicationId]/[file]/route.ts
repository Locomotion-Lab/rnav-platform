import { readPublishedMedia } from "@/lib/server/publication";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ publicationId: string; file: string }> }) {
  const {publicationId,file}=await context.params;
  try {
    const media=await readPublishedMedia(publicationId,file);
    return new Response(new Uint8Array(media.bytes),{headers:{"Content-Type":media.contentType,"Cache-Control":"public, max-age=60, must-revalidate","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
  } catch { return new Response("Not found",{status:404}); }
}
