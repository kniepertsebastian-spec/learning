"use client";

import { c_reviewerReviewerProbe } from "@/lib/i18n/components/reviewerReviewerProbe";
import { fill } from "@/lib/i18n/fill";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PROBE_ERROR_LABEL, PROBE_ERROR_TYPES } from "@/lib/reviewers/probe";
import type { ProbeErrorType, ProbeReport } from "@/lib/server/db/schema";
import type { Locale } from "@/lib/types";

export type ProbeOverviewJson = {
  qualified: boolean;
  source: "probe" | "admin" | null;
  openAttemptId: string | null;
  available: Array<{ id: string; title: string; topic: string; itemCount: number }>;
  blockedUntil: string | null;
  lastOutcome: "passed" | "failed" | null;
};
export type ProbeAttemptJson = {
  id: string;
  title: string;
  topic: string;
  items: Array<{ id: string; question: string; options: Array<{ text: string; isCorrect: boolean }>; explanation: string }>;
  reports: ProbeReport[];
};

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, data: { error: "Netzwerkfehler" } };
  }
}

/** Probe-Review für neue Prüfer: Fragen prüfen und fehlerhafte melden. Ergebnis nur „bestanden/nicht bestanden“, Einzelheiten sind intern. */
export function ReviewerProbe({ overview, attempt, locale }: { overview: ProbeOverviewJson; attempt: ProbeAttemptJson | null; locale: Locale }) {
  const [confirm, confirmDialog] = useConfirm();
  const de = locale === "de";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ passed: boolean; nextAttemptAt: string | null } | null>(null);
  const date = (iso: string) => new Date(iso).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" });

  async function start(setId: string) {
    setBusy(true);
    setError(null);
    const r = await send("/api/reviewer/probe/attempts", "POST", { setId });
    setBusy(false);
    if (!r.ok) return setError(String(r.data.error ?? "Das hat nicht geklappt."));
    router.refresh();
  }

  async function submit() {
    if (!attempt || !(await confirm(c_reviewerReviewerProbe(de).submitTheAttemptYouCannot))) return;
    setBusy(true);
    setError(null);
    const r = await send(`/api/reviewer/probe/attempts/${attempt.id}/submit`, "POST");
    setBusy(false);
    if (!r.ok) return setError(String(r.data.error ?? "Das hat nicht geklappt."));
    setResult({ passed: Boolean(r.data.passed), nextAttemptAt: (r.data.nextAttemptAt as string | null) ?? null });
    router.refresh();
  }

  if (result) {
    return (
      <Card data-testid="probe-result" data-passed={result.passed}>
        <h2 className="mb-1 text-lg font-semibold">{result.passed ? (c_reviewerReviewerProbe(de).passed) : c_reviewerReviewerProbe(de).notPassed}</h2>
        <p className="text-sm text-subtle">
          {result.passed
            ? c_reviewerReviewerProbe(de).youCanNowApproveCourses
            : fill(c_reviewerReviewerProbe(de).youCanTryAgainWith, date(result.nextAttemptAt ?? new Date().toISOString()))}
        </p>
      </Card>
    );
  }

  if (overview.qualified) {
    return (
      <Card data-testid="probe-qualified">
        <p className="text-sm">
          <Badge tone="mint">{c_reviewerReviewerProbe(de).cleared}</Badge>{" "}
          {overview.source === "probe" ? (c_reviewerReviewerProbe(de).youPassedTheTrialReview) : c_reviewerReviewerProbe(de).theOperatorHasClearedYou}{" "}
          {c_reviewerReviewerProbe(de).youCanApproveCoursesAnd}
        </p>
      </Card>
    );
  }

  if (attempt) {
    const reportOf = (id: string) => attempt.reports.find((r) => r.itemId === id) ?? null;
    return (
      <div className="flex flex-col gap-4" data-testid="probe-attempt">
        {confirmDialog}
        <div>
          <h2 className="text-lg font-semibold">{attempt.title}</h2>
          <p className="text-sm text-subtle">
            {c_reviewerReviewerProbe(de).checkEveryQuestionTechnicallyIs}
          </p>
          <p className="mt-1 text-xs text-subtle" data-testid="probe-count">{attempt.reports.length} {c_reviewerReviewerProbe(de).of} {attempt.items.length} {c_reviewerReviewerProbe(de).questionsReported}</p>
        </div>
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
        <ol className="flex flex-col gap-3">
          {attempt.items.map((item, i) => (
            <ProbeItem key={item.id} index={i + 1} item={item} report={reportOf(item.id)} attemptId={attempt.id} de={de} onChanged={() => router.refresh()} />
          ))}
        </ol>
        <div>
          <Button onClick={() => void submit()} disabled={busy} data-testid="probe-submit">{c_reviewerReviewerProbe(de).submitAttempt}</Button>
        </div>
      </div>
    );
  }

  return (
    <>
    {confirmDialog}
    <div className="flex flex-col gap-4" data-testid="probe-start">
      <p className="text-sm text-subtle">
        {c_reviewerReviewerProbe(de).beforeYouCanApproveCourses}
      </p>
      {overview.lastOutcome === "failed" && <p className="text-sm text-warning-text" data-testid="probe-failed-note">{c_reviewerReviewerProbe(de).yourLastAttemptWasNot}</p>}
      {overview.blockedUntil && <p className="text-sm" data-testid="probe-blocked">{fill(c_reviewerReviewerProbe(de).theNextAttemptIsPossible, date(overview.blockedUntil))}</p>}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      {overview.available.length === 0 && !overview.blockedUntil && <p className="text-sm text-subtle" data-testid="probe-none">{c_reviewerReviewerProbe(de).noSetIsAvailableFor}</p>}
      <ul className="flex flex-col gap-2">
        {overview.available.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm" data-testid="probe-set">
            <span>
              <span className="font-medium">{s.title}</span> <span className="text-subtle">· {s.topic} · {s.itemCount} {c_reviewerReviewerProbe(de).questions}</span>
            </span>
            <Button size="sm" onClick={() => void start(s.id)} disabled={busy} data-testid="probe-begin">{c_reviewerReviewerProbe(de).begin}</Button>
          </li>
        ))}
      </ul>
    </div>
    </>
  );
}

function ProbeItem({ index, item, report, attemptId, de, onChanged }: { index: number; item: ProbeAttemptJson["items"][number]; report: ProbeReport | null; attemptId: string; de: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ProbeErrorType>(report?.type ?? "wrong_key");
  const [text, setText] = useState(report?.text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (t: ProbeErrorType) => PROBE_ERROR_LABEL[t][de ? "de" : "en"];

  async function save(next: { type: ProbeErrorType; text: string } | null) {
    setBusy(true);
    setError(null);
    const r = await send(`/api/reviewer/probe/attempts/${attemptId}/reports`, "PUT", { itemId: item.id, report: next });
    setBusy(false);
    if (!r.ok) return setError(String(r.data.error ?? "Das hat nicht geklappt."));
    if (!next) setText("");
    setOpen(false);
    onChanged();
  }

  return (
    <li className="rounded-2xl border border-border bg-surface p-5 text-sm" data-testid="probe-item" data-reported={Boolean(report)}>
      <p className="font-medium">{index}. {item.question}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {item.options.map((o, k) => (
          <li key={k} className={o.isCorrect ? "font-medium text-mint-text" : ""}>
            {o.isCorrect ? (c_reviewerReviewerProbe(de).answerKey) : "· "}
            {o.text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-subtle">{c_reviewerReviewerProbe(de).explanation}: {item.explanation}</p>
      {report && !open && (
        <p className="mt-2 text-xs" data-testid="probe-reported">
          <Badge tone="warning">{c_reviewerReviewerProbe(de).reported}</Badge> {label(report.type)}: {report.text}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!open && <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid="probe-report-open">{report ? (c_reviewerReviewerProbe(de).editReport) : c_reviewerReviewerProbe(de).reportAsFaulty}</Button>}
        {report && !open && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(null)} data-testid="probe-report-remove">{c_reviewerReviewerProbe(de).withdrawReport}</Button>}
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-accent-border p-3" data-testid="probe-report-form">
          <label className="text-xs font-medium">
            {c_reviewerReviewerProbe(de).kindOfError}
            <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value as ProbeErrorType)} data-testid="probe-report-type">
              {PROBE_ERROR_TYPES.map((t) => (
                <option key={t} value={t}>{label(t)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            {c_reviewerReviewerProbe(de).reason}
            <textarea className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} data-testid="probe-report-text" />
          </label>
          {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || text.trim().length < 3} onClick={() => void save({ type, text })} data-testid="probe-report-save">{c_reviewerReviewerProbe(de).saveReport}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{c_reviewerReviewerProbe(de).cancel}</Button>
          </div>
        </div>
      )}
    </li>
  );
}
