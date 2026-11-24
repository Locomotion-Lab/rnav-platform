import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../app.js";
import { assistantCapabilitiesSchema, assistantEquipmentSchema, createAssistantRouter } from "./assistant.js";

test("assistant data follows member permissions and omits private asset fields", async () => {
  const router = createAssistantRouter((request, _response, next) => {
    const role = request.get("x-fixture-role");
    if (role) request.authUser = {
      id: "fixture", username: "fixture", displayName: "Fixture",
      baseTier: role === "admin" ? "super" : "normal",
      permissions: role === "alumni" ? ["console.access"] : ["console.access", "lab_assets.read"],
    };
    next();
  }, {
    async getSnapshot(actor) {
      assert.equal(actor?.canManage, false);
      return { assets: [{ code: "E1", name: { zh: "设备", en: "Equipment" }, manufacturer: "", model: "",
        condition: "normal", currentPlatformCode: null, vendorSerial: "secret", borrowerContact: "secret" }] };
    },
  });
  const app = createApp({ routers: [router], health: { database: async () => true } });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const call = (path: string, role?: string, method = "GET") =>
      fetch(`http://127.0.0.1:${address.port}/api/v1/assistant/${path}`, { method, headers: role ? { "x-fixture-role": role } : {} });
    assert.equal((await call("equipment")).status, 401);
    assert.equal((await call("equipment", "alumni")).status, 403);
    const read = await (await call("equipment", "member")).json();
    assert.doesNotMatch(JSON.stringify(read), /secret/);
    assert.deepEqual(assistantEquipmentSchema.parse(read).items.map((item) => item.code), ["E1"]);
    for (const [role, canRequestChanges] of [["member", false], ["admin", true]] as const) {
      const capabilities = assistantCapabilitiesSchema.parse(await (await call("capabilities", role)).json());
      assert.equal(capabilities.canRequestChanges, canRequestChanges);
      assert.equal(capabilities.writeToolsEnabled, false);
      assert.equal((await call("equipment", role, "POST")).status, 404);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
