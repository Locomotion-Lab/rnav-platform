import assert from "node:assert/strict";import test from "node:test";
import {shouldCopyMedia} from "./media-policy.js";
test("external scholarly PDF links are never treated as owned objects",()=>{
 for(const url of ['https://arxiv.org/pdf/2601.12345.pdf','https://openaccess.thecvf.com/a.pdf','https://doi.org/paper.pdf']) assert.equal(shouldCopyMedia(url,'href',false),false);
 assert.equal(shouldCopyMedia('https://arxiv.org/pdf/2601.12345.pdf','src',false),false);
 assert.equal(shouldCopyMedia('/api/media/files/id','src',true),true);
 assert.equal(shouldCopyMedia('https://r-navigation-1326672316.cos.ap-beijing.myqcloud.com/rnav/a.pdf','href',false),true);
});
