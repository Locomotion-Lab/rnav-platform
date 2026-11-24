export const memberRoleLabels = { teacher: "老师", student: "学生" } as const;
export const degreeLabels = { phd: "博士", master: "硕士", undergrad: "本科" } as const;
export const memberStatusLabels = { current: "在校", alumni: "校友" } as const;

export type MemberRole = keyof typeof memberRoleLabels;
export type Degree = keyof typeof degreeLabels;
export type MemberStatus = keyof typeof memberStatusLabels;

export type DirectoryMember = {
  userId: string; username: string; nameZh: string; nameEn: string;
  memberStatus: MemberStatus; memberRole: MemberRole; degrees: Degree[];
  bioZh: string; bioEn: string; publicEmail: string; phone: string;
  researchInterestsZh: string; researchInterestsEn: string;
  enrollmentYear: string; graduationYear: string; majorZh: string; majorEn: string;
  thesisZh: string; thesisEn: string; destinationZh: string; destinationEn: string;
  avatarAssetId: string | null; avatarUrl: string | null;
  avatarPositionX: number; avatarPositionY: number; avatarZoom: number;
  personalLinks: Array<{ labelZh: string; labelEn: string; url: string }>;
};

export type MemberProfile = DirectoryMember & {
  accountKind: "person" | "system";
  publicVisible: boolean; publicFields: string[]; version: number;
  profileContentUpdatedAt: string | null;
  completeness: { complete: boolean; publishable: boolean; missing: string[] };
};

export const publicProfileFieldGroups = [
  {
    label: "身份",
    fields: [
      ["name_zh", "中文姓名"],
      ["name_en", "英文姓名"],
      ["avatar", "头像"],
      ["academic_stage", "在组身份与学位"],
      ["enrollment_year", "入组年份"],
      ["graduation_year", "毕业年份"],
    ],
  },
  {
    label: "学术",
    fields: [
      ["major", "专业"],
      ["research", "研究方向"],
      ["bio", "个人简介"],
      ["thesis", "学位论文"],
      ["destination", "毕业去向"],
    ],
  },
  {
    label: "联系",
    fields: [
      ["email", "公开邮箱"],
      ["phone", "电话"],
      ["links", "个人链接"],
    ],
  },
] as const;

