import assert from "node:assert/strict";
import test from "node:test";
import { prepareWebHandler } from "./webRuntime.js";

const options = { serverMode: "api" as const, nodeEnv: "production", host: "0.0.0.0", port: 4090 };

test("API mode never loads Next or resolves a web directory", async () => {
  const unavailable = () => { throw new Error("No web installation"); };
  assert.equal(await prepareWebHandler(options, { loadNext: unavailable, resolveWebDir: unavailable }), undefined);
});

test("unified mode prepares Next before returning its request handler", async () => {
  let prepared = false;
  const handler = () => undefined;
  const result = await prepareWebHandler({ ...options, serverMode: "unified" }, {
    resolveWebDir: () => "/test/web",
    loadNext: async () => (configuration) => {
      assert.equal(configuration.dir, "/test/web");
      assert.equal(configuration.dev, false);
      return {
        prepare: async () => { prepared = true; },
        getRequestHandler: () => { assert.equal(prepared, true); return handler; },
      };
    },
  });
  assert.equal(result, handler);
});
