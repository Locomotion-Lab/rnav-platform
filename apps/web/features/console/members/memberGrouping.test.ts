import assert from "node:assert/strict";
import test from "node:test";
import { memberGroup } from "./memberGrouping.ts";

test("teachers remain teachers regardless of degree", () => {
  assert.equal(memberGroup({ memberRole: "teacher", degrees: ["phd"] }), "teacher");
});

test("students are grouped by highest degree and unknown degrees stay unclassified", () => {
  assert.equal(memberGroup({ memberRole: "student", degrees: ["master", "phd"] }), "phd");
  assert.equal(memberGroup({ memberRole: "student", degrees: ["phd"] }), "phd");
  assert.equal(memberGroup({ memberRole: "student", degrees: ["master", "undergrad"] }), "master");
  assert.equal(memberGroup({ memberRole: "student", degrees: ["undergrad"] }), "undergrad");
  assert.equal(memberGroup({ memberRole: "student", degrees: [] }), "student");
});
