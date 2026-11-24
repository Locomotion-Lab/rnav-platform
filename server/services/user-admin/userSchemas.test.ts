import assert from "node:assert/strict";
import test from "node:test";
import { createUserSchema, importUsersSchema } from "./userSchemas.js";

const student = { username: "zhangsan", nameZh: "张三", nameEn: "San-Zhang", memberRole: "student", degrees: ["master", "phd"] };

test("creating a member keeps multiple degrees in display order and accepts a missing account email", () => {
  const result = createUserSchema.parse(student);
  assert.deepEqual(result.degrees, ["phd", "master"]);
  assert.equal(result.email, "");
  assert.equal(result.memberStatus, "current");
  assert.equal(createUserSchema.safeParse({ ...student, degrees: ["phd", "phd"] }).success, false);
  assert.equal(createUserSchema.safeParse({ ...student, degrees: ["postdoc"] }).success, false);
});

test("account creation only accepts person accounts and independently permits teachers with doctorates", () => {
  assert.equal(createUserSchema.safeParse({ ...student, memberRole: "teacher", degrees: ["phd"] }).success, true);
  assert.equal(createUserSchema.safeParse({ ...student, accountKind: "system" }).success, false);
});

test("member import accepts multiple blank account emails and uses the new identity fields", () => {
  assert.equal(importUsersSchema.safeParse({ rows: [student, { ...student, username: "lisi", nameZh: "李四", nameEn: "Si-Li" }] }).success, true);
  assert.equal(importUsersSchema.safeParse({ rows: [{ ...student, academicStage: "phd" }] }).success, false);
});

test("person account identity fields must match the normalized Chinese name", () => {
  assert.equal(createUserSchema.safeParse({ ...student, username: "san-zhang" }).success, false);
  assert.equal(createUserSchema.safeParse({ ...student, nameEn: "San Zhang" }).success, false);
  assert.equal(createUserSchema.safeParse({ ...student, nameZh: "张三同学" }).success, false);
});
