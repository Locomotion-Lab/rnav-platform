import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalStorage } from "./provider.js";

test("local storage persists bytes, refuses overwrite/traversal/symlinks, and deletes explicitly", async () => {
  const root=await mkdtemp(join(tmpdir(),"rnav-storage-"));
  try {
    const provider=createLocalStorage(root);
    await provider.putObject({key:"rnav/image.png",body:Buffer.from("image"),contentType:"image/png"});
    assert.equal((await provider.getObject!("rnav/image.png")).toString(),"image");
    await assert.rejects(provider.putObject({key:"rnav/image.png",body:Buffer.from("replace"),contentType:"image/png"}));
    await assert.rejects(provider.getObject!("../secret"));
    await mkdir(join(root,"elsewhere")); await symlink(join(root,"elsewhere"),join(root,"shortcut"));
    await assert.rejects(provider.putObject({key:"shortcut/leak.png",body:Buffer.from("leak"),contentType:"image/png"}));
    await provider.deleteObject("rnav/image.png"); await assert.rejects(provider.getObject!("rnav/image.png"));
  } finally { await rm(root,{recursive:true,force:true}); }
});
