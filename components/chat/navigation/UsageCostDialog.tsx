"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { ConversationUsageBreakdown, ConversationUsageSummary } from "@/lib/llm/usage/conversation-usage";

export function UsageCostDialog({ conversationId, summary, triggerClassName, triggerRole, triggerRef, showTrigger = true }: { conversationId: number; summary: ConversationUsageSummary; triggerClassName?: string; triggerRole?: "menuitem"; triggerRef?: React.Ref<HTMLButtonElement>; showTrigger?: boolean }) {
  const [rows, setRows] = useState<ConversationUsageBreakdown[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const label = summary.knownEstimatedCost
    ? summary.knownEstimatedCost.startsWith("<") ? summary.knownEstimatedCost : `Estimated ${summary.knownEstimatedCost}`
    : summary.pendingAttemptCount > 0 && summary.unknownAttemptCount === 0 ? "Calculating cost…" : "Cost unavailable";

  function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRows(null); setError(false); setLoading(true);
    void fetch(`/api/chat/usage?conversationId=${conversationId}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("usage_fetch_failed")))
      .then((data) => { if (!controller.signal.aborted) setRows(data.breakdown); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }

  return <Dialog.Root onOpenChange={(nextOpen) => { if (nextOpen) load(); else request.current?.abort(); }}>
    <Dialog.Trigger ref={triggerRef} role={triggerRole} aria-hidden={!showTrigger || undefined} tabIndex={showTrigger ? undefined : -1} className={showTrigger ? (triggerClassName ?? "shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted") : "sr-only"}>
      {label}
      {summary.pendingAttemptCount > 0 && summary.knownEstimatedCost && <span className="ml-1 text-xs text-muted-foreground">{summary.pendingAttemptCount} calculating</span>}
      {summary.unknownAttemptCount > 0 && <span className="ml-1 text-xs text-muted-foreground">{summary.unknownAttemptCount} unknown</span>}
    </Dialog.Trigger>
    <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40" /><Dialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"><Dialog.Popup className="max-h-[85vh] w-full overflow-auto rounded-t-xl bg-background p-5 shadow-xl sm:max-w-3xl sm:rounded-xl">
      <div className="flex items-center justify-between gap-4"><Dialog.Title className="text-base font-semibold">Usage &amp; estimated cost</Dialog.Title><Dialog.Close className="rounded-md px-3 py-1 text-sm hover:bg-muted" aria-label="Close usage and cost dialog">Close</Dialog.Close></div>
      <Dialog.Description className="mt-1 text-sm text-muted-foreground">Estimate only; provider invoice is authoritative.</Dialog.Description>
      {loading ? <p className="mt-5 text-sm">Loading…</p> : error ? <p className="mt-5 text-sm" role="alert">Unable to load usage details.</p> : rows?.length ? <div className="mt-5 space-y-3">{rows.map((row, index) => <section key={`${row.provider}-${row.requestedModel}-${index}`} className="rounded-lg border border-border p-3 text-sm"><h3 className="font-medium">{row.provider} · {row.requestedModel ?? "Legacy model"}</h3><p className="text-muted-foreground">Effective: {row.effectiveModel ?? "unknown"} · Attempts: {row.attempts} · Retries: {row.retries}</p><p>Input {row.inputTokens} · Cached {row.cachedInputTokens} · Output {row.outputTokens} · Reasoning {row.reasoningTokens}</p><p>{row.estimatedCost ? `Estimated ${row.estimatedCost}` : row.pendingCount ? "Calculating cost…" : "Cost unavailable"}{row.pendingCount ? ` · ${row.pendingCount} calculating` : ""}{row.unknownCount ? ` · ${row.unknownCount} unknown (${row.unknownReason})` : ""}{row.legacyCount ? ` · ${row.legacyCount} legacy` : ""}{row.notApplicableCount ? ` · ${row.notApplicableCount} not applicable` : ""}</p></section>)}</div> : <p className="mt-5 text-sm">No usage details available.</p>}
    </Dialog.Popup></Dialog.Viewport></Dialog.Portal>
  </Dialog.Root>;
}
