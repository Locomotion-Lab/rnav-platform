"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RNAV_BRAND_ASSETS } from "@/lib/brand";
import type { ConsoleTier } from "./bootstrap";
import { ConsoleSidebarNav } from "./ConsoleSidebarNav";
import { groupConsoleModules, isConsoleRouteActive, type ConsoleNavigationModule } from "./navigation";
import { NotificationBell } from "./NotificationBell";
import { TierBadge } from "./TierBadge";
import { ConsoleIcon } from "./ui/ConsoleIcon";

type ShellUser = { displayName: string; username: string; tier: ConsoleTier };
const iconButton = "grid size-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900";
const accountItem = "flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100";

function ConsoleBrand() {
  return (
    <Link className="flex min-h-16 flex-1 items-center gap-3 px-5" href="/console">
      <Image alt="" className="h-7 w-auto shrink-0" height={28} src={RNAV_BRAND_ASSETS.mark} unoptimized width={32} />
      <span className="text-sm font-semibold text-slate-950">RNAV 控制台</span>
    </Link>
  );
}

export function ConsoleShell({ modules, user, children, publicHome = "/" }: {
  publicHome?: string;
  modules: ConsoleNavigationModule[];
  user: ShellUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const drawer = useRef<HTMLDialogElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const name = user.displayName || user.username;
  const initials = name.trim().slice(0, 2).toUpperCase();
  const currentModule = groupConsoleModules(modules)
    .flatMap((group) => group.modules)
    .find((item) => isConsoleRouteActive(pathname, item.href));

  useEffect(() => {
    drawer.current?.close();
    if (accountMenu.current) accountMenu.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeDrawerOnDesktop = () => { if (desktop.matches) drawer.current?.close(); };
    const closeAccount = (event: PointerEvent) => {
      const menu = accountMenu.current;
      if (menu && !menu.contains(event.target as Node)) menu.open = false;
    };
    const escapeAccount = (event: KeyboardEvent) => {
      const menu = accountMenu.current;
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    desktop.addEventListener("change", closeDrawerOnDesktop);
    document.addEventListener("pointerdown", closeAccount);
    document.addEventListener("keydown", escapeAccount);
    return () => {
      desktop.removeEventListener("change", closeDrawerOnDesktop);
      document.removeEventListener("pointerdown", closeAccount);
      document.removeEventListener("keydown", escapeAccount);
    };
  }, []);

  async function logout() {
    setLogoutPending(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("退出失败，请重试。");
      setLogoutPending(false);
    }
  }

  return (
    <div className="console-root min-h-screen lg:grid lg:grid-cols-[228px_minmax(0,1fr)]">
      <a className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-slate-950 px-4 py-2 text-sm text-white focus:translate-y-0" href="#console-content">
        跳到主要内容
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-slate-200 bg-slate-50 lg:flex">
        <div className="flex shrink-0 border-b border-slate-200"><ConsoleBrand /></div>
        <ConsoleSidebarNav modules={modules} />
      </aside>
      <dialog
        aria-label="控制台导航"
        className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-[min(19rem,88vw)] bg-slate-50 text-slate-900 backdrop:bg-slate-950/45 lg:hidden"
        id="console-drawer"
        onClick={(event) => { if (event.target === event.currentTarget) drawer.current?.close(); }}
        ref={drawer}
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center border-b border-slate-200 pr-2">
            <ConsoleBrand />
            <button aria-label="关闭导航" className={iconButton} onClick={() => drawer.current?.close()} type="button">
              <ConsoleIcon className="size-5" name="close" />
            </button>
          </div>
          <ConsoleSidebarNav modules={modules} onNavigate={() => drawer.current?.close()} />
        </div>
      </dialog>
      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex min-h-16 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-4 sm:px-6 lg:px-8">
          <button aria-controls="console-drawer" aria-haspopup="dialog" aria-label="打开导航" className={`${iconButton} lg:hidden`} onClick={() => drawer.current?.showModal()} type="button">
            <ConsoleIcon className="size-5" name="menu" />
          </button>
          <nav aria-label="面包屑" className="min-w-0 flex-1 truncate text-sm">
            {currentModule ? <>
              <Link className="text-slate-600 hover:text-cyan-800" href="/console">工作台</Link>
              <span aria-hidden="true" className="mx-2 text-slate-400">/</span>
              <span aria-current="page" className="font-semibold text-slate-900">{currentModule.label}</span>
            </> : <span aria-current="page" className="font-semibold text-slate-900">工作台</span>}
          </nav>
          <NotificationBell />
          <details className="relative shrink-0" ref={accountMenu}>
            <summary aria-label="打开账号菜单" className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-950">{initials}</span>
              <span className="hidden max-w-28 truncate font-medium sm:inline">{name}</span>
              <ConsoleIcon className="hidden size-3 text-slate-500 sm:block" name="chevron-down" />
            </summary>
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200">
              <div className="border-b border-slate-100 px-3 py-3">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="mb-2 truncate text-xs text-slate-600">@{user.username}</p>
                <TierBadge tier={user.tier} />
              </div>
              <Link className={`mt-1 ${accountItem}`} href="/console/profile"><ConsoleIcon name="user" />个人资料</Link>
              <Link className={accountItem} href={publicHome}><ConsoleIcon name="external" />访问官网</Link>
              <button className={`${accountItem} text-red-700 disabled:opacity-60`} disabled={logoutPending} onClick={() => void logout()} type="button">
                <ConsoleIcon name="logout" />{logoutPending ? "正在退出…" : "退出登录"}
              </button>
              {logoutError && <p className="px-3 pb-2 text-xs text-red-700" role="alert">{logoutError}</p>}
            </div>
          </details>
        </header>
        <main className="mx-auto min-w-0 max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8" id="console-content">
          {children}
        </main>
      </div>
    </div>
  );
}
