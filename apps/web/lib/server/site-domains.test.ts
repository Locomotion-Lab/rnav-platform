import assert from "node:assert/strict";
import test from "node:test";
import { domainRoute } from "./site-domains.ts";
import { getRequestOrigin } from "./request-origin.ts";

const website = "https://r-navigation.com";
const consoleSite = "https://console.r-navigation.com";
const route = (host: string, path: string) => domainRoute(host, path, website, consoleSite);

test("domain routing moves legacy console pages and keeps protected APIs on the console host", () => {
  assert.deepEqual(route("r-navigation.com", "/console/members/1"), { redirect: consoleSite + "/console/members/1" });
  assert.deepEqual(route("r-navigation.com", "/ai"), { redirect: consoleSite + "/console/assistant" });
  assert.deepEqual(route("r-navigation.com", "/api/auth/login"), { deny: true });
  assert.deepEqual(route("r-navigation.com", "/api/v1/publicity"), { deny: true });
  assert.deepEqual(route("r-navigation.com", "/api/v1/public/team"), { deny: false });
  assert.deepEqual(route("console.r-navigation.com", "/"), { redirect: consoleSite + "/console" });
  assert.deepEqual(route("console.r-navigation.com", "/api/v1/assistant/equipment"), { deny: false });
  assert.deepEqual(route("console.r-navigation.com", "/research"), { redirect: website + "/research" });
  assert.deepEqual(route("invalid.example", "/console"), { deny: true });
});

test("BFF origin uses the configured domain for the actual host, ignoring forwarded claims", (t) => {
  const previousWeb = process.env.RNAV_WEB_ORIGIN;
  const previousConsole = process.env.RNAV_CONSOLE_ORIGIN;
  process.env.RNAV_WEB_ORIGIN = website;
  process.env.RNAV_CONSOLE_ORIGIN = consoleSite;
  t.after(() => {
    if (previousWeb === undefined) delete process.env.RNAV_WEB_ORIGIN;
    else process.env.RNAV_WEB_ORIGIN = previousWeb;
    if (previousConsole === undefined) delete process.env.RNAV_CONSOLE_ORIGIN;
    else process.env.RNAV_CONSOLE_ORIGIN = previousConsole;
  });
  const request = (host: string) => new Request("http://127.0.0.1:13000/api/auth/login", {
    headers: { host, "x-forwarded-host": "console.r-navigation.com", "x-forwarded-proto": "http" },
  });
  assert.equal(getRequestOrigin(request("r-navigation.com")).origin, website);
  assert.equal(getRequestOrigin(request("console.r-navigation.com")).origin, consoleSite);
  assert.throws(() => getRequestOrigin(request("invalid.example")), /Unrecognized/);
});
