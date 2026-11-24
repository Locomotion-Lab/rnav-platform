export type BaseTier = "normal" | "super";
export type DisplayTier = BaseTier;

export type ConsoleModule = {
  key: string;
  href: string;
  label: string;
  requiredAny: string[];
};

export const knownPermissionKeys = [
  "console.access",
  "profile.read_own",
  "profile.write_own",
  "lab_assets.read",
  "site.content.write",
  "site.publish",
  "site.members.write",
  "site.media.write",
  "lab_assets.write",
  "users.read",
  "users.write",
  "system.settings.write"
] as const;

export const basePermissionKeys = [
  "console.access",
  "profile.read_own",
  "profile.write_own",
  "lab_assets.read",
] as const;

export function getRolePermissions(baseTier: BaseTier): string[] {
  return baseTier === "super" ? [...knownPermissionKeys] : [...basePermissionKeys];
}

const moduleDefinitions: ConsoleModule[] = [
  {
    key: "profile",
    href: "/console/profile",
    label: "个人资料",
    requiredAny: ["console.access", "profile.read_own", "profile.write_own"]
  },
  {
    key: "lab-assets",
    href: "/console/lab-assets",
    label: "设备管理",
    requiredAny: ["lab_assets.read", "lab_assets.write"]
  },
  {
    key: "site",
    href: "/console/site",
    label: "对外展示信息管理",
    requiredAny: ["site.content.write", "site.members.write", "site.publish"]
  },
  {
    key: "media",
    href: "/console/media",
    label: "媒体资源",
    requiredAny: ["site.media.write"]
  },
  {
    key: "members",
    href: "/console/members",
    label: "成员与账号管理",
    requiredAny: ["console.access"]
  },
  {
    key: "assistant",
    href: "/console/assistant",
    label: "小砺智能体",
    requiredAny: ["console.access"]
  },
  {
    key: "settings",
    href: "/console/settings",
    label: "系统设置",
    requiredAny: ["system.settings.write"]
  }
];

export function getConsoleModules(baseTier: BaseTier) {
  const permissionSet = new Set(getRolePermissions(baseTier));
  return moduleDefinitions
    .filter((module) =>
      module.requiredAny.some((permission) => permissionSet.has(permission))
    )
    .map(({ requiredAny: _requiredAny, ...module }) => module);
}
