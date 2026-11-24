"use client";

import { useState } from "react";
import { consoleApi } from "@/lib/consoleApi";
import type { PublicationReview } from "@/lib/api-contract";
import { ConsoleAlert, ConsoleButton } from "@/features/console/ui";

export function PublicationRelease({ dirty }: { dirty: boolean }) {
  const [review, setReview] = useState<PublicationReview | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState("");
  const endpoint = "/api/v1/publications";

  async function prepare() {
    setBusy(true); setError(""); setReview(null); setApproved(false); setPublished("");
    try {
      const { id } = await consoleApi<{ id: string }>(`${endpoint}/prepare`, { method: "POST" });
      setReview(await consoleApi<PublicationReview>(`${endpoint}/${id}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法生成发布预览");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!review) return;
    setBusy(true); setError("");
    try {
      if (!approved) {
        await consoleApi(`${endpoint}/${review.id}/approve`, {
          method: "POST", body: JSON.stringify({ sha256: review.sha256 }),
        });
        setApproved(true);
      }
      const result = await consoleApi<{ publicationId: string }>(`${endpoint}/${review.id}/activate`, {
        method: "POST", body: JSON.stringify({ expectedCurrent: review.currentId }),
      });
      setPublished(result.publicationId); setReview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发布失败，请刷新预览后重试");
    } finally {
      setBusy(false);
    }
  }

  return <section className="my-5 space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-label="官网发布">
    {error && <ConsoleAlert title="发布操作失败" tone="danger">{error}</ConsoleAlert>}
    {published && <ConsoleAlert title="官网已发布" tone="success">版本 {published}</ConsoleAlert>}
    <ConsoleButton type="button" disabled={dirty || busy} onClick={() => void prepare()}>生成官网发布预览</ConsoleButton>
    {review && <>
      <p className="text-sm text-slate-600">本次预览含 {Object.keys(review.publication.pages).length} 个公开页面、{Object.keys(review.publication.members).length} 份公开成员资料、{review.publication.media.length} 个公开媒体文件。</p>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">查看本次公开内容</summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(review.publication, null, 2)}</pre>
      </details>
      <ConsoleButton type="button" variant="primary" disabled={dirty || busy} onClick={() => void publish()}>确认并发布此版本</ConsoleButton>
    </>}
  </section>;
}
