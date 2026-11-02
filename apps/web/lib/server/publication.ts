import "server-only";
import { cache } from "react";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readCurrent, safeFile, validatePublication, sha256 } from "@rnav/publication";

const readRequestPublication = cache(readCurrent);

export async function readPublished(path: string) {
  const root = process.env.RNAV_PUBLIC_ROOT;
  if (!root) throw new Error("RNAV_PUBLIC_ROOT is required in snapshot mode");
  const publication = await readRequestPublication(root);
  if (path.startsWith("team-members/")) {
    const slug = decodeURIComponent(path.slice("team-members/".length));
    return Object.hasOwn(publication.members,slug) ? publication.members[slug] : null;
  }
  return Object.hasOwn(publication.pages,path) ? publication.pages[path] : null;
}
export async function readPublishedMedia(publicationId: string, file: string) {
  const root = process.env.RNAV_PUBLIC_ROOT;
  if (!root || !/^[a-zA-Z0-9_-]{1,80}$/.test(publicationId) || !/^[a-f0-9]{64}\.(png|jpg|webp|pdf)$/.test(file)) throw new Error("Invalid public media path");
  const current = await readRequestPublication(root);
  if (!current.media.some(item=>item.path===`media/${file}`)) throw new Error("Media withdrawn from current publication");
  const directory = join(root,"versions",publicationId);
  const publication = validatePublication(JSON.parse(await readFile(await safeFile(directory,"snapshot.json"),"utf8")));
  const item = publication.media.find(item=>item.path===`media/${file}`);
  if (!item) throw new Error("Unpublished file");
  const bytes = await readFile(await safeFile(directory,item.path));
  if (bytes.length !== item.size || sha256(bytes) !== item.sha256) throw new Error("Public media integrity failed");
  return { bytes, contentType:item.contentType };
}
