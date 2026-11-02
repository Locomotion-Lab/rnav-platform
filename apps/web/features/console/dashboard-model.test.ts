import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConsoleDashboard } from "./dashboard-model.ts";

const dashboard = {
  user: { id: "user-1", displayName: "张三", tier: "plus", roleLabels: ["资产管理员"] },
  tasks: { labUsageReviews: 2 },
  mine: { labUsageOpen: 1, assetsInUse: 2 },
  recentItems: [{
    id: "request-1",
    type: "lab_usage",
    title: "设备使用申请",
    status: "submitted",
    href: "/console/lab-assets",
    updatedAt: "2026-09-12T12:30:00.000Z",
  }],
};

test("normalizes a complete role-aware dashboard payload", () => {
  const result = normalizeConsoleDashboard(dashboard);
  assert.equal(result.tasks.labUsageReviews, 2);
  assert.equal(result.recentItems[0].type, "lab_usage");
});

test("rejects negative counters and links outside the console", () => {
  assert.throws(() => normalizeConsoleDashboard({
    ...dashboard,
    tasks: { ...dashboard.tasks, labUsageReviews: -1 },
  }));
  assert.throws(() => normalizeConsoleDashboard({
    ...dashboard,
    recentItems: [{ ...dashboard.recentItems[0], href: "https://example.com" }],
  }));
});
