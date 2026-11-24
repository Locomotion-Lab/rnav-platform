import { z } from "zod";

export const mediaMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const mediaCategories = ["avatar", "site", "device", "other"] as const;
export type MediaCategory = (typeof mediaCategories)[number];
export const mediaListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["active", "recycled"]).default("active"),
  category: z.enum(mediaCategories).optional(),
}).strict();
export const mediaIdSchema = z.string().uuid();
export const mediaUploadSchema = z.object({
  category: z.enum(mediaCategories).default("other"),
  avatarUserId: mediaIdSchema.optional(),
}).strict().refine((value) => !value.avatarUserId || value.category === "avatar");
