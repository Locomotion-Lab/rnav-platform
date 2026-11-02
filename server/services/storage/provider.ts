import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { safeFile } from "@rnav/publication";
import { createCosGateway } from "../media/cosGateway.js";

export interface StorageProvider {
  name?: "local" | "cos";
  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  deleteObject(key: string): Promise<void>;
  getObject?(key: string): Promise<Buffer>;
  forProvider?(name: "local" | "cos"): StorageProvider;
}

function validKey(key: string) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(key) || key.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Unsafe storage key");
}
export function createLocalStorage(root: string): StorageProvider {
  return {
    name: "local",
    async putObject({ key, body }) {
      validKey(key);
      await mkdir(root, { recursive: true });
      // Create directories one at a time and verify that none is a symlink.
      let relative = "";
      for (const part of key.split("/").slice(0, -1)) {
        relative += (relative ? "/" : "") + part;
        await mkdir(join(root,relative), { recursive: true });
        await safeFile(root,relative);
      }
      const handle = await open(join(root,key), "wx", 0o600);
      try { await handle.writeFile(body); } finally { await handle.close(); }
    },
    async getObject(key) { validKey(key); return readFile(await safeFile(root,key)); },
    async deleteObject(key) { validKey(key); await unlink(await safeFile(root,key)); },
  };
}
export function createStorage(options: {
  storageProvider: "local" | "cos"; storageRoot: string;
  cosSecretId?: string; cosSecretKey?: string; cosRegion?: string; cosBucket?: string;
}): StorageProvider {
  const local = createLocalStorage(options.storageRoot);
  const cos: StorageProvider = { name: "cos", ...createCosGateway({ secretId: options.cosSecretId, secretKey: options.cosSecretKey, region: options.cosRegion, bucket: options.cosBucket }) };
  return { ...(options.storageProvider === "local" ? local : cos), forProvider: name => name === "local" ? local : cos };
}
