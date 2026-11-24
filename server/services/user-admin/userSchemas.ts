import { z } from "zod";
import { degreesSchema, memberRoleSchema } from "../account/memberIdentity.js";
import { personIdentityFromChineseName } from "./memberIdentity.js";
export { adminProfileUpdateSchema } from "../account/profileSchemas.js";

function validatePersonIdentity(
  value: { username: string; nameZh: string; nameEn: string },
  context: z.RefinementCtx,
) {
  const identity = personIdentityFromChineseName(value.nameZh);
  if (!identity) {
    context.addIssue({ code: "custom", path: ["nameZh"], message: "中文姓名必须为 2–6 个汉字，不得包含职称或空格" });
    return;
  }
  if (value.username !== identity.username)
    context.addIssue({ code: "custom", path: ["username"], message: `用户名必须为“姓+名”的小写拼音：${identity.username}` });
  if (value.nameEn !== identity.nameEn)
    context.addIssue({ code: "custom", path: ["nameEn"], message: `英文名必须为“名-姓”格式：${identity.nameEn}` });
}

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/),
  nameZh: z.string().trim().max(100),
  nameEn: z.string().trim().max(100),
  memberRole: memberRoleSchema,
  memberStatus: z.enum(["current", "alumni"]).default("current"),
  degrees: degreesSchema,
  email: z.union([z.literal(""), z.string().trim().email().max(320)]).default(""),
  baseTier: z.enum(["normal", "super"]).default("normal"),
}).strict().superRefine((value, context) => {
  validatePersonIdentity(value, context);
});
export const userListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["active", "disabled", "invited"]).optional(),
  tier: z.enum(["normal", "super"]).optional(),
  publicVisibility: z.enum(["public", "private"]).optional(),
  profile: z.enum(["complete", "incomplete", "stale"]).optional(),
  login: z.enum(["never", "active", "stale"]).optional(),
  memberStatus: z.enum(["current", "alumni"]).optional()
}).strict();
export const statusSchema = z.object({ status: z.enum(["active", "disabled"]) }).strict();
export const tierSchema = z.object({ baseTier: z.enum(["normal", "super"]) }).strict();
export const publicProfileAdminSchema = z.object({
  publicVisible: z.boolean(),
}).strict();
export const userIdSchema = z.string().uuid();
export const accountEmailSchema = z.object({ email: z.union([z.literal(""), z.string().trim().email().max(320)]) }).strict();
export const importUserRowSchema = z.object(createUserSchema.shape).strict().extend({
  baseTier: z.enum(["normal", "super"]).default("normal"),
  publicEmail: z.union([z.literal(""), z.string().email().max(320)]).default(""),
}).superRefine((value, context) => {
  if (!value.nameZh) context.addIssue({ code: "custom", path: ["nameZh"], message: "中文姓名为必填项" });
  validatePersonIdentity(value, context);
});
export const importUsersSchema = z.object({ rows: z.array(importUserRowSchema).min(1).max(500) }).strict();
