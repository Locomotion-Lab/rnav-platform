"use client";

import { useState, type ChangeEvent } from "react";
import { readSheet } from "read-excel-file/browser";
import { consoleApi } from "@/lib/consoleApi";
import { ConsoleButton } from "@/features/console/ui/ConsoleButton";
import { ConsoleDialog } from "@/features/console/ui/ConsoleOverlay";
import { personIdentityFromChineseName } from "./memberIdentity";
import { degreeLabels, memberRoleLabels, memberStatusLabels, type Degree, type MemberRole, type MemberStatus } from "./profileModel";

type Row = {
  username: string; nameZh: string; nameEn: string;
  memberRole: MemberRole; memberStatus: MemberStatus; degrees: Degree[];
  email: string; publicEmail: string; baseTier: "normal" | "super";
};

export function MemberImportDialog({ busy, onClose, onImport, error }: {
  busy: boolean; onClose: () => void; onImport: (rows: Row[]) => Promise<void>; error: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [issue, setIssue] = useState("");
  const [validating, setValidating] = useState(false);

  async function read(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setRows([]);
    setValidating(true);
    setIssue("");
    try {
      const matrix: unknown[][] = file.name.toLowerCase().endsWith(".csv")
        ? (await file.text()).split(/\r?\n/).filter(Boolean).map((line) => line.split(","))
        : await readSheet(file);
      const text = (cell: unknown) => String(cell ?? "").trim();
      const header = matrix[0]?.map((cell) => text(cell).toLowerCase()) ?? [];
      if (!header.includes("namezh") || !header.includes("memberrole"))
        throw new Error("缺少 nameZh 或 memberRole 列");
      const at = (row: unknown[], column: string) => text(row[header.indexOf(column)]);
      const parsed = matrix.slice(1).filter((row) => row.some((cell) => text(cell))).map((row, index) => {
        const identity = personIdentityFromChineseName(at(row, "namezh"));
        const memberRole = at(row, "memberrole");
        const memberStatus = at(row, "memberstatus") || "current";
        const degrees = at(row, "degrees").split(/[|、；;]/).map((degree) => degree.trim()).filter(Boolean);
        const baseTier = at(row, "basetier") || "normal";
        if (!identity || !(memberRole === "teacher" || memberRole === "student")
          || !(memberStatus === "current" || memberStatus === "alumni")
          || !(baseTier === "normal" || baseTier === "super")
          || degrees.some((degree) => !Object.hasOwn(degreeLabels, degree))) {
          throw new Error(`第 ${index + 2} 行的姓名、身份、学位或账号角色无效`);
        }
        return { ...identity, memberRole, memberStatus, degrees: degrees as Degree[], baseTier,
          email: at(row, "accountemail").toLowerCase(), publicEmail: at(row, "publicemail") } satisfies Row;
      });
      if (!parsed.length) throw new Error("没有可导入的成员");
      const report = await consoleApi<{ valid: boolean; rows: Array<{ index: number; issues: string[] }> }>(
        "/api/v1/users/import/validate", { method: "POST", body: JSON.stringify({ rows: parsed }) },
      );
      if (!report.valid) throw new Error(report.rows.filter((row) => row.issues.length)
        .map((row) => `第 ${row.index + 1} 行：${row.issues.join("、")}`).join("；"));
      setRows(parsed);
    } catch (problem) {
      setIssue(problem instanceof Error ? problem.message : "文件解析失败");
    } finally { setValidating(false); }
  }

  return <ConsoleDialog open onClose={onClose} title="批量导入成员" footer={
    <ConsoleButton disabled={busy || validating || !rows.length} onClick={() => void onImport(rows)} variant="primary">
      导入 {rows.length || ""} 人
    </ConsoleButton>
  }>
    <p className="text-sm leading-6 text-slate-600">支持 CSV 和 XLSX。必填列为 <code>nameZh</code> 和 <code>memberRole</code>（teacher / student）。</p>
    <p className="mt-2 text-sm leading-6 text-slate-600">可添加 <code>degrees</code>（phd|master|undergrad，多值用 | 分隔）、<code>memberStatus</code>（current / alumni）、<code>accountEmail</code>、<code>publicEmail</code> 和 <code>baseTier</code>（normal / super）。</p>
    <input aria-label="选择成员导入文件" accept=".csv,.xlsx" className="mt-4 w-full rounded-lg border border-dashed border-slate-400 p-4 text-sm"
      disabled={busy || validating} type="file" onChange={(event) => void read(event)} />
    {validating ? <p role="status" className="mt-3 text-sm text-slate-500">正在验证文件…</p> : null}
    {issue || error ? <p role="alert" className="mt-3 text-sm text-red-700">{issue || error}</p> : null}
    {rows.length ? <ul className="mt-4 max-h-52 divide-y divide-slate-100 overflow-auto text-sm">
      {rows.map((row) => <li className="py-2" key={row.username}>{row.nameZh} · {memberRoleLabels[row.memberRole]}
        {row.degrees.length ? ` · ${row.degrees.map((degree) => degreeLabels[degree]).join("、")}` : ""} · {memberStatusLabels[row.memberStatus]}</li>)}
    </ul> : null}
  </ConsoleDialog>;
}
