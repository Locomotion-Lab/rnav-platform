"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { consoleApi } from "@/lib/consoleApi";
import { ConsoleButton } from "@/features/console/ui/ConsoleButton";
import { ConsoleDialog } from "@/features/console/ui/ConsoleOverlay";
import { MemberProfileEditor } from "./MemberProfileEditor";
import { MemberImportDialog } from "./MemberImportDialog";
import { AccountEmailEditor } from "./AccountEmailEditor";
import { AccountDeletionPanel } from "./AccountDeletionPanel";
import { accountLifecycleCopy } from "./accountDeletion";
import { groupMembers } from "./memberGrouping";
import { personIdentityFromChineseName } from "./memberIdentity";
import { degreeLabels, memberRoleLabels, memberStatusLabels, type DirectoryMember, type MemberProfile } from "./profileModel";

type Account = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  accountKind: "person" | "system";
  baseTier: "normal" | "super";
  status: "active" | "disabled" | "invited";
};

const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const card = "rounded-xl border border-slate-200 bg-white p-5";

export function MemberManagement({ actorId, isAdmin, initialMemberId, initialProfileFilter }: {
  actorId: string;
  isAdmin: boolean;
  initialMemberId?: string;
  initialProfileFilter?: string;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filteredIds, setFilteredIds] = useState<Set<string> | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<"profile" | "account">("profile");
  const [dialog, setDialog] = useState<"create" | "import" | null>(null);
  const [credentials, setCredentials] = useState<Array<{ username: string; temporaryPassword: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const account = accounts.find((item) => item.id === initialMemberId);
  const member = members.find((item) => item.userId === initialMemberId);
  const load = useCallback(async () => {
    const requests = [consoleApi<{ members: DirectoryMember[] }>("/api/v1/users/directory").then((result) => setMembers(result.members))];
    if (isAdmin) {
      requests.push(consoleApi<{ users: Account[] }>("/api/v1/users").then((result) => setAccounts(result.users)));
      if (initialProfileFilter === "incomplete" || initialProfileFilter === "stale") {
        requests.push(consoleApi<{ users: Account[] }>(`/api/v1/users?profile=${initialProfileFilter}`).then(
          (result) => setFilteredIds(new Set(result.users.map((item) => item.id))),
        ));
      } else setFilteredIds(null);
    }
    await Promise.all(requests);
  }, [isAdmin, initialProfileFilter]);

  useEffect(() => {
    load().catch((cause) => setError(cause.message)).finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!isAdmin || !initialMemberId || account?.accountKind !== "person") return;
    let showing = true;
    consoleApi<MemberProfile>(`/api/v1/users/${initialMemberId}/profile`).then(
      (result) => { if (showing) setProfile(result); },
      (cause) => { if (showing) setError(cause.message); },
    );
    return () => { showing = false; };
  }, [isAdmin, initialMemberId, account?.accountKind]);

  async function run(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try { await action(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const identity = personIdentityFromChineseName(String(form.get("nameZh") ?? ""));
    if (!identity) { setError("请输入 2–6 个汉字的中文姓名"); return; }
    await run(async () => {
      const result = await consoleApi<{ id: string; temporaryPassword: string }>("/api/v1/users", {
        method: "POST",
        body: JSON.stringify({ ...identity, email: form.get("email"), memberRole: form.get("memberRole"),
          memberStatus: form.get("memberStatus"), degrees: form.getAll("degrees") }),
      });
      setCredentials([{ username: identity.username, temporaryPassword: result.temporaryPassword }]);
      setDialog(null);
    });
  }

  const memberPath = `/api/v1/users/${initialMemberId}`;
  const changeAccount = (path: string, value: object) =>
    consoleApi(memberPath + "/" + path, { method: "PUT", body: JSON.stringify(value) });
  const accountRole = account?.baseTier === "super" ? "管理员" : "成员";
  const visible = members.filter((item) =>
    (!filteredIds || filteredIds.has(item.userId))
    && (!status || item.memberStatus === status)
    && [item.nameZh, item.nameEn, item.username, item.researchInterestsZh, item.researchInterestsEn]
      .some((value) => value.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const systemAccount = accounts.find((item) => item.accountKind === "system" && item.username === "admin");

  return <section className="space-y-6">
    {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
    {loading ? <p role="status" className="text-sm text-slate-600">正在加载成员…</p> : initialMemberId ? <>
      <Link className="inline-block text-sm font-semibold text-cyan-800" href="/console/members">← 返回成员列表</Link>
      {member || (isAdmin && account) ? <>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">{member?.nameZh || member?.nameEn || (account ? `@${account.username}` : "")}</h1>
          {account?.accountKind === "person" ? <nav aria-label="成员管理" className="flex gap-2">
            <ConsoleButton onClick={() => setEditor("profile")} variant={editor === "profile" ? "primary" : "secondary"}>资料编辑</ConsoleButton>
            <ConsoleButton onClick={() => setEditor("account")} variant={editor === "account" ? "primary" : "secondary"}>账号管理</ConsoleButton>
          </nav> : null}
        </header>
        {isAdmin && account ? account.accountKind === "system" || editor === "account" ?
          <div className={`${card} max-w-2xl space-y-5`}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-slate-500">用户名</dt><dd className="font-medium">@{account.username}</dd></div>
              <div><dt className="text-slate-500">账号状态</dt><dd className="font-medium">{{ active: "已启用", disabled: "已停用", invited: "待启用" }[account.status]}</dd></div>
            </dl>
            <label className="block text-sm font-medium">权限身份
              <select className={input} value={account.baseTier} disabled={busy}
                onChange={(event) => {
                  const baseTier = event.target.value;
                  if (!window.confirm(`将 @${account.username} 设为${baseTier === "super" ? "管理员" : "成员"}？该账号需要重新登录。`)) return;
                  void run(async () => {
                    await changeAccount("tier", { baseTier });
                    if (account.id === actorId) { router.replace("/console"); router.refresh(); }
                  });
                }}>
                <option value="normal">成员</option>
                <option value="super">管理员</option>
              </select>
            </label>
            <AccountEmailEditor busy={busy} canEdit email={account.email} onSave={(email) => run(() => changeAccount("account-email", { email }))} />
            <div className="flex flex-wrap gap-2">
              {account.accountKind === "person" ? <ConsoleButton disabled={busy || account.id === actorId} onClick={() => {
                const next = account.status === "active" ? "disabled" : "active";
                if (next === "active" || window.confirm(`停用 @${account.username}？${accountLifecycleCopy.disable}`)) void run(() => changeAccount("status", { status: next }));
              }}>{account.status === "active" ? "停用账号" : "启用账号"}</ConsoleButton> : null}
              <ConsoleButton disabled={busy} onClick={() => {
                if (!window.confirm(`为 @${account.username} 重置密码？现有会话将退出。`)) return;
                void run(async () => {
                  const result = await consoleApi<{ temporaryPassword: string }>(memberPath + "/reset-password", { method: "POST" });
                  setCredentials([{ username: account.username, temporaryPassword: result.temporaryPassword }]);
                });
              }}>重置密码</ConsoleButton>
              <ConsoleButton disabled={busy} onClick={() => {
                if (window.confirm(`撤销 @${account.username} 的所有登录会话？`))
                  void run(() => consoleApi(memberPath + "/revoke-sessions", { method: "POST" }));
              }}>结束登录会话</ConsoleButton>
            </div>
            <p className="text-xs text-slate-500">当前权限为{accountRole}。</p>
            {account.accountKind === "person" && account.id !== actorId ? <AccountDeletionPanel
              displayName={account.displayName} userId={account.id} username={account.username}
              onDeleted={async () => { router.replace("/console/members"); await load(); }}
            /> : null}
          </div> : profile?.userId === account.id ? <MemberProfileEditor
            key={account.id} member={profile} busy={busy} canEdit
            onReload={() => consoleApi<MemberProfile>(memberPath + "/profile")}
            onSave={async (body) => {
              const saved = await consoleApi<MemberProfile>(memberPath + "/profile", { method: "PUT", body: JSON.stringify(body) });
              setProfile(saved);
              setMembers((current) => current.map((item) => item.userId === saved.userId ? saved : item));
              void load().catch((cause) => setError(cause.message));
              return saved;
            }}
          /> : <p role="status" className="text-sm text-slate-600">正在加载资料…</p>
        : member ? <div className={`${card} max-w-3xl`}><MemberCardBody member={member} full /></div> : null}
      </> : <p className="text-sm text-slate-600">该成员不存在。</p>}
    </> : <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">成员与账号管理</h1>
        {isAdmin ? <div className="flex flex-wrap gap-2">
          <ConsoleButton onClick={() => setDialog("import")}>批量导入</ConsoleButton>
          <ConsoleButton onClick={() => setDialog("create")} variant="primary">新增成员</ConsoleButton>
        </div> : null}
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <input className={`${input} max-w-xs`} aria-label="搜索成员" placeholder="搜索姓名、用户名或研究方向" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="筛选在校状态" className={`${input} max-w-36`} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">全部状态</option>
          {Object.entries(memberStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {filteredIds ? <Link href="/console/members" className="text-sm font-medium text-cyan-800">清除资料筛选</Link> : null}
      </div>
      {groupMembers(visible).map((group) => <section className="space-y-3" key={group.key}>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">{group.label}<span className="text-sm font-normal tabular-nums text-slate-500">{group.members.length}</span></h2>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{group.members.map((item) =>
          <Link className={`${card} block transition-colors hover:border-cyan-600 focus-visible:outline-cyan-700`} key={item.userId}
            href={`/console/members/${item.userId}`} aria-label={`${isAdmin ? "编辑" : "查看"} ${item.nameZh || item.nameEn || item.username}`}>
            <MemberCardBody member={item} />
          </Link>,
        )}</div>
      </section>)}
      {!visible.length ? <p className={`${card} text-sm text-slate-600`}>没有符合条件的成员。</p> : null}
      {systemAccount ? <section className={card}>
        <h2 className="font-semibold text-slate-900">系统账号</h2>
        <Link className="mt-2 inline-block text-sm font-medium text-cyan-800" href={`/console/members/${systemAccount.id}`}>@admin</Link>
      </section> : null}
    </>}
    <ConsoleDialog open={dialog === "create"} title="新增成员" onClose={() => setDialog(null)}>
      <form className="space-y-3" onSubmit={(event) => void create(event)}>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <label className="block text-sm">中文姓名<input className={input} name="nameZh" required /></label>
        <label className="block text-sm">账号邮箱（可选）<input className={input} name="email" type="email" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">在组身份<select className={input} defaultValue="student" name="memberRole">
            {Object.entries(memberRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label className="block text-sm">在校状态<select className={input} name="memberStatus">
            {Object.entries(memberStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        </div>
        <fieldset><legend className="text-sm">学位身份</legend><div className="mt-2 flex gap-4">
          {Object.entries(degreeLabels).map(([value, label]) => <label className="flex items-center gap-1 text-sm" key={value}><input name="degrees" type="checkbox" value={value} />{label}</label>)}
        </div></fieldset>
        <ConsoleButton disabled={busy} type="submit" variant="primary">创建账号</ConsoleButton>
      </form>
    </ConsoleDialog>
    {dialog === "import" ? <MemberImportDialog busy={busy} onClose={() => setDialog(null)} onImport={(rows) => run(async () => {
      const result = await consoleApi<{ credentials: typeof credentials }>("/api/v1/users/import", { method: "POST", body: JSON.stringify({ rows }) });
      setCredentials(result.credentials);
      setDialog(null);
    })} error={error} /> : null}
    <ConsoleDialog open={credentials.length > 0} title="临时密码" description="请通过私下渠道交给账号本人。关闭后不会再次显示。" onClose={() => setCredentials([])}>
      <ul className="max-h-72 space-y-2 overflow-auto">{credentials.map((entry) =>
        <li key={entry.username} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
          <span>@{entry.username}</span><code className="break-all">{entry.temporaryPassword}</code>
        </li>,
      )}</ul>
    </ConsoleDialog>
  </section>;
}

function MemberCardBody({ member, full = false }: { member: DirectoryMember; full?: boolean }) {
  const name = member.nameZh || member.nameEn || member.username;
  const facts = [
    ["在组身份", memberRoleLabels[member.memberRole]], ["学位身份", member.degrees.map((degree) => degreeLabels[degree]).join("、")],
    ["入组年份", member.enrollmentYear], ["毕业年份", member.graduationYear],
    ["专业", [member.majorZh, member.majorEn].filter(Boolean).join(" / ")],
    ["研究方向", [member.researchInterestsZh, member.researchInterestsEn].filter(Boolean).join(" / ")],
    ...(full ? [
      ["学位论文", [member.thesisZh, member.thesisEn].filter(Boolean).join(" / ")],
      ["毕业去向", [member.destinationZh, member.destinationEn].filter(Boolean).join(" / ")],
      ["联系邮箱", member.publicEmail], ["电话", member.phone],
    ] : []),
  ].filter(([, value]) => value);

  return <>
    <div className="flex items-center gap-4">
      <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-cyan-50 font-semibold text-cyan-900">
        {member.avatarUrl ? <Image alt="" fill sizes="56px" src={member.avatarUrl} unoptimized className="object-cover"
          style={{ objectPosition: `${member.avatarPositionX}% ${member.avatarPositionY}%`,
            transformOrigin: `${member.avatarPositionX}% ${member.avatarPositionY}%`, transform: `scale(${member.avatarZoom})` }} /> : name.slice(0, 2)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate-950">{name}</p>
        <p className="break-words text-xs text-slate-500">{[member.nameZh && member.nameEn, `@${member.username}`].filter(Boolean).join(" · ")}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${member.memberStatus === "alumni" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-800"}`}>
        {memberStatusLabels[member.memberStatus]}
      </span>
    </div>
    {full ? <div className="mt-4 space-y-2">
      {[member.bioZh, member.bioEn].filter(Boolean).map((bio, index) => <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700" key={index}>{bio}</p>)}
    </div> : null}
    <dl className="mt-4 grid gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
      {facts.map(([label, value]) => <div className="min-w-0" key={label}>
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className={`break-words text-slate-800 ${full ? "" : "line-clamp-2"}`}>{value}</dd>
      </div>)}
    </dl>
    {full && member.personalLinks.length ? <ul className="mt-4 flex flex-wrap gap-3">
      {member.personalLinks.map((link) => /^https?:\/\//i.test(link.url) ? <li key={link.url}>
        <a className="text-sm font-medium text-cyan-800 underline" href={link.url} rel="noreferrer" target="_blank">{link.labelZh || link.labelEn || link.url}</a>
      </li> : null)}
    </ul> : null}
  </>;
}
