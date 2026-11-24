export type ConsoleNavigationModule = {
  href: string;
  key: string;
  label: string;
};

export type ConsoleNavigationGroup = {
  key: "business" | "tools" | "account";
  label: string;
  modules: ConsoleNavigationModule[];
};

const navigationGroups: Array<
  Omit<ConsoleNavigationGroup, "modules"> & { moduleKeys: string[] }
> = [
  { key: "business", label: "业务", moduleKeys: ["site", "members", "lab-assets"] },
  { key: "tools", label: "工具", moduleKeys: ["media", "assistant"] },
  { key: "account", label: "账号与设置", moduleKeys: ["profile", "settings"] },
];

export function groupConsoleModules(
  modules: ConsoleNavigationModule[],
): ConsoleNavigationGroup[] {
  return navigationGroups
    .map(({ moduleKeys, ...group }) => ({
      ...group,
      modules: moduleKeys.flatMap((key) =>
        modules.filter((module) => module.key === key),
      ),
    }))
    .filter((group) => group.modules.length > 0);
}

export function isConsoleRouteActive(pathname: string, href: string) {
  const path = href.split(/[?#]/, 1)[0];
  return pathname === path || (path !== "/console" && pathname.startsWith(`${path}/`));
}
