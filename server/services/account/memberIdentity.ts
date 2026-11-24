import { z } from "zod";

export const degreeOrder = ["phd", "master", "undergrad"] as const;
export type Degree = (typeof degreeOrder)[number];

export const memberRoleSchema = z.enum(["teacher", "student"]);
export const degreesSchema = z.array(z.enum(degreeOrder))
  .max(degreeOrder.length)
  .refine((degrees) => new Set(degrees).size === degrees.length, "学位身份不可重复")
  .transform((degrees) => degreeOrder.filter((degree) => degrees.includes(degree)));

export type MemberRole = z.output<typeof memberRoleSchema>;

// Older deployments and offline tools still read this column.
export function legacyDegreeLevel(role: MemberRole, degrees: Degree[]) {
  return role === "teacher" ? "faculty" : degrees[0] ?? "";
}
