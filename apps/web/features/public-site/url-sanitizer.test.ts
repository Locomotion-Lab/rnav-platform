import assert from "node:assert/strict";
import test from "node:test";
import { publicChromeHref, sanitizeActionUrl, sanitizePublicUrl } from "./url-sanitizer.ts";

test("public chrome excludes internal destinations from configured links", () => {
  for (const href of ["/login", "/console/settings", "/ai", "https://www.r-navigation.com/admin", "https://console.r-navigation.com/"]) {
    assert.equal(publicChromeHref(href), "", href);
  }
  assert.equal(publicChromeHref("/research#publications"), "/research#publications");
  assert.equal(publicChromeHref("https://liesmars.whu.edu.cn/"), "https://liesmars.whu.edu.cn/");
});

test("contact actions allow strict mailto and tel links", () => {
  assert.equal(sanitizeActionUrl("mailto:lab@example.com"), "mailto:lab@example.com");
  assert.equal(sanitizeActionUrl("tel:+86 (27) 6877-1234"), "tel:+86 (27) 6877-1234");
});

test("contact actions reject controls, encoded controls, backslashes, and invalid characters", () => {
  for (const value of [
    "mailto:lab@example.com\nBcc:evil@example.com",
    "mailto:lab@example.com%0aBcc:evil@example.com",
    "mailto:lab\\@example.com",
    "tel:+86\\1234",
    "tel:123%0d456",
    "tel:javascript:alert(1)"
  ]) {
    assert.equal(sanitizeActionUrl(value), "", value);
  }
});

test("media and document URLs still reject contact schemes", () => {
  assert.equal(sanitizePublicUrl("mailto:lab@example.com"), "");
  assert.equal(sanitizePublicUrl("tel:+86-27-6877-1234"), "");
});
