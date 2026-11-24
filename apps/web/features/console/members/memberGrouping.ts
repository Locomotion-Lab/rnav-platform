import { degreeLabels, type Degree, type DirectoryMember } from "./profileModel.ts";

const groupDefinitions = [
  { key: "teacher", label: "老师" },
  { key: "phd", label: "博士生" },
  { key: "master", label: "硕士生" },
  { key: "undergrad", label: "本科生" },
  { key: "student", label: "学生 · 学位待补充" },
] as const;

const degreeOrder = Object.keys(degreeLabels) as Degree[];

export function memberGroup(member: Pick<DirectoryMember, "memberRole" | "degrees">) {
  return member.memberRole === "teacher"
    ? "teacher"
    : degreeOrder.find((degree) => member.degrees.includes(degree)) ?? "student";
}

export function groupMembers(members: DirectoryMember[]) {
  return groupDefinitions.map((group) => ({
    ...group,
    members: members.filter((member) => memberGroup(member) === group.key),
  })).filter((group) => group.members.length);
}
