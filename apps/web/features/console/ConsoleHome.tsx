import Link from "next/link";
import type { ConsoleBootstrap } from "./bootstrap";
import type { ConsoleDashboardResult } from "./dashboard";
import type { ConsoleDashboard } from "./dashboard-model";
import { groupConsoleModules, type ConsoleNavigationModule } from "./navigation";
import { ConsoleIcon } from "./ui/ConsoleIcon";
import { ConsoleStatusBadge } from "./ui/ConsoleStatusBadge";

const statusLabels: Record<string, string> = {
  approved: "已批准", closed: "已完成", rejected: "已驳回", cancelled: "已取消", pending: "待处理",
};
const businessDescriptions: Record<string, string> = {
  site: "编辑官网内容、审核论文和发布展示",
  members: "管理成员资料、账号和权限",
  "lab-assets": "查询设备台账和申请使用",
};
const rowClass = "flex min-h-12 items-center justify-between gap-4 px-4 py-3 sm:px-5";
const shortTime = new Intl.DateTimeFormat("zh-CN", {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai",
});

function taskTone(status: string) {
  if (status === "rejected" || status === "cancelled") return "danger";
  if (status === "pending") return "warning";
  return "success";
}

function DashboardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="mb-3 text-base font-semibold text-slate-950">{title}</h2>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">{children}</div>
    </section>
  );
}

function BusinessLinks({ modules }: { modules: ConsoleNavigationModule[] }) {
  if (!modules.length) return null;
  return (
    <DashboardSection title="业务入口">
      {modules.map((module) => (
        <Link className={`${rowClass} hover:bg-cyan-50/60`} href={module.href} key={module.key}>
          <span>
            <span className="block text-sm font-semibold text-slate-900">{module.label}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-600">{businessDescriptions[module.key]}</span>
          </span>
          <ConsoleIcon className="size-4 shrink-0 -rotate-90 text-slate-500" name="chevron-down" />
        </Link>
      ))}
    </DashboardSection>
  );
}

function TaskList({ dashboard, permissions }: { dashboard: ConsoleDashboard; permissions: string[] }) {
  const canManageMembers = permissions.includes("site.members.write");
  const tasks = [
    { allowed: permissions.includes("lab_assets.write"), count: dashboard.tasks.labUsageReviews, href: "/console/lab-assets?view=requests", label: "设备申请审批" },
    { allowed: canManageMembers, count: dashboard.tasks.incompleteProfiles, href: "/console/members?profile=incomplete", label: "成员资料待完善" },
    { allowed: canManageMembers, count: dashboard.tasks.staleProfiles, href: "/console/members?profile=stale", label: "成员资料待复核" },
  ].filter((item) => item.allowed && item.count > 0);
  return (
    <DashboardSection title="待办">
      {tasks.length ? tasks.map((task) => (
        <Link className={`${rowClass} hover:bg-cyan-50/60`} href={task.href} key={task.label}>
          <span className="text-sm font-medium text-slate-900">{task.label}</span>
          <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-cyan-900">{task.count}</span>
        </Link>
      )) : <p className={`${rowClass} text-sm text-slate-600`}>当前没有待办。</p>}
    </DashboardSection>
  );
}

function EquipmentActivity({ dashboard }: { dashboard: ConsoleDashboard }) {
  return (
    <DashboardSection title="我的设备">
      <div className="grid grid-cols-2 divide-x divide-slate-100">
        <Link className="flex items-center justify-between gap-2 p-4 text-sm text-slate-700 hover:bg-slate-50 sm:px-5" href="/console/lab-assets?view=requests">
          处理中申请<strong className="text-base tabular-nums text-slate-950">{dashboard.mine.labUsageOpen}</strong>
        </Link>
        <Link className="flex items-center justify-between gap-2 p-4 text-sm text-slate-700 hover:bg-slate-50 sm:px-5" href="/console/lab-assets?view=assets">
          在用设备<strong className="text-base tabular-nums text-slate-950">{dashboard.mine.assetsInUse}</strong>
        </Link>
      </div>
      {dashboard.recentItems.length ? dashboard.recentItems.map((item) => (
        <Link className={`${rowClass} hover:bg-slate-50`} href={item.href} key={item.id}>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-900">{item.title}</span>
            <time className="block text-xs text-slate-600" dateTime={item.updatedAt}>{shortTime.format(new Date(item.updatedAt))}</time>
          </span>
          <ConsoleStatusBadge tone={taskTone(item.status)}>{statusLabels[item.status] ?? item.status}</ConsoleStatusBadge>
        </Link>
      )) : <p className={`${rowClass} text-sm text-slate-600`}>近期没有设备申请更新。</p>}
    </DashboardSection>
  );
}

export function ConsoleHome({ bootstrap, dashboard }: { bootstrap: ConsoleBootstrap; dashboard: ConsoleDashboardResult }) {
  const modules = groupConsoleModules(bootstrap.consoleModules).find((group) => group.key === "business")?.modules ?? [];
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">工作台</h1>
        <p className="mt-2 text-sm text-slate-600">{bootstrap.user.displayName || bootstrap.user.username}</p>
      </header>
      <div className={`grid gap-7 ${modules.length ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" : ""}`}>
        <BusinessLinks modules={modules} />
        {dashboard.status === "ready" ? (
          <div className="min-w-0 space-y-7">
            <TaskList dashboard={dashboard.data} permissions={bootstrap.permissions} />
            {modules.some((module) => module.key === "lab-assets") && <EquipmentActivity dashboard={dashboard.data} />}
          </div>
        ) : <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700" role="status">{dashboard.message}</p>}
      </div>
    </div>
  );
}
