import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAuthenticatedUser } from "../../middleware/auth.js";
import { basePermissionKeys, getConsoleModules, getRolePermissions, knownPermissionKeys } from "./permissions.js";

test("members and administrators each have one fixed permission set", () => {
  assert.deepEqual(getRolePermissions("normal"), [...basePermissionKeys]);
  assert.deepEqual(getRolePermissions("super"), [...knownPermissionKeys]);
  assert.equal(knownPermissionKeys.some((p) => /^(monitor|procurements|permissions)\./.test(p)), false);
});

test("historical grants and alumni status do not change a member's permission role", () => {
  const user = normalizeAuthenticatedUser({
    id: "member", username: "member", displayName: "Member", baseTier: "normal", memberStatus: "alumni",
    permissions: ["users.write", "site.publish"],
  });
  assert.deepEqual(user.permissions, [...basePermissionKeys]);
});

test("both roles can browse the directory and administrators can manage all active modules", () => {
  const memberKeys = getConsoleModules("normal").map((module) => module.key);
  const adminKeys = getConsoleModules("super").map((module) => module.key);
  assert.deepEqual(memberKeys, ["profile", "lab-assets", "members", "assistant"]);
  assert.deepEqual(adminKeys, ["profile", "lab-assets", "site", "media", "members", "assistant", "settings"]);
});
