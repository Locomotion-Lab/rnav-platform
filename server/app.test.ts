import assert from "node:assert/strict";
import test from "node:test";
import { Router } from "express";
import { createApp } from "./app.js";

test("independent API serves v1 aliases, rejects retired features and has no page fallback", async () => {
  const router = Router();
  router.get("/api/profile", (_req, res) => res.json({ core: true }));
  const server = createApp({ health: { database: async () => true }, routers: [router] }).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const base = `http://127.0.0.1:${address.port}`;
    for (const path of ["/api/profile", "/api/v1/profile", "/api/v1/health"]) assert.equal((await fetch(base + path)).status, 200);
    for (const path of ["/console", "/", "/api/monitor/public/bootstrap", "/api/procurements", "/api/v1/procurements"]) assert.equal((await fetch(base + path)).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
