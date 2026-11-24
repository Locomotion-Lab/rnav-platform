"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  groupConsoleModules,
  isConsoleRouteActive,
  type ConsoleNavigationModule,
} from "@/features/console/navigation";
import { ConsoleIcon, type ConsoleIconName } from "@/features/console/ui/ConsoleIcon";

type ConsoleSidebarNavProps = { modules: ConsoleNavigationModule[]; onNavigate?: () => void };
const linkClassName = "flex min-h-11 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const activeLink = "bg-cyan-50 text-cyan-900";
const idleLink = "text-slate-700 hover:bg-slate-100 hover:text-slate-950";
const icons: Record<string, ConsoleIconName> = { profile: "user", "lab-assets": "asset", site: "site", media: "media", members: "users", assistant: "info", settings: "settings" };

export function ConsoleSidebarNav({ modules, onNavigate }: ConsoleSidebarNavProps) {
  const pathname = usePathname();
  const groups = groupConsoleModules(modules);
  const homeActive = isConsoleRouteActive(pathname, "/console");

  return (
    <nav aria-label="控制台导航" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      <div>
        <Link aria-current={homeActive ? "page" : undefined} className={`${linkClassName} mt-1 ${homeActive ? activeLink : idleLink}`} href="/console" onClick={onNavigate}>
          <ConsoleIcon className="size-4" name="home"/>工作台
        </Link>
      </div>
      {groups.map((group) => (
        <section aria-label={group.label} key={group.key}>
          <p className="px-3 text-xs font-semibold text-slate-600">{group.label}</p>
          <div className="mt-1 space-y-1">
            {group.modules.map((link) => {
              const isActive = isConsoleRouteActive(pathname, link.href);
              return (
                <Link aria-current={isActive ? "page" : undefined} className={`${linkClassName} ${isActive ? activeLink : idleLink}`} href={link.href} key={link.key} onClick={onNavigate}>
                  <ConsoleIcon className="size-4" name={icons[link.key] || "site"}/>
                  {link.label}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
