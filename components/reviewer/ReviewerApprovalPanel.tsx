"use client";

import { c_reviewerReviewerApprovalPanel } from "@/lib/i18n/components/reviewerReviewerApprovalPanel";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Change = { id: string; label: string; change: "added" | "removed" | "changed" };
const CHANGE_DE = { added: "neu", removed: "entfernt", changed: "geändert" } as const;
const CHANGE_EN = { added: "new", removed: "removed", changed: "changed" } as const;

export interface ReviewerApprovalData {
  state: "none" | "current" | "changed";
  approvedBy: string | null;
  versionLabel: string | null;
  approvedAtIso: string | null;
  /** Änderungen seit der letzten Freigabe dieses Prüfers; null = noch nie freigegeben (ganzer Kurs zu prüfen). */
  sinceOwn: { count: number; sections: Change[]; questions: Change[] } | null;
  suggestedName: string;
}

/** Freigabe durch den Prüfer: Stand, nur der Diff seit seiner letzten Freigabe, Bestätigung. */
export function ReviewerApprovalPanel({ certId, data, locale, canApprove = true }: { certId: string; data: ReviewerApprovalData; locale: "de" | "en"; canApprove?: boolean }) {
  const router = useRouter();
  const de = locale === "de";
  const [name, setName] = useState(data.suggestedName);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upToDate = data.state === "current" && (!data.sinceOwn || data.sinceOwn.count === 0) && data.sinceOwn !== null;
  const date = (iso: string) => new Date(iso).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" });

  async function approve() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/reviewer/courses/${certId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name, confirmed }) });
    setBusy(false);
    if (!res.ok) return setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Fehler ${res.status}`);
    setConfirmed(false);
    router.refresh();
  }

  return (
    <section className="mb-6 rounded-2xl border border-border bg-surface p-5 text-sm" data-testid="reviewer-approval" data-state={data.state}>
      <h2 className="font-semibold">{c_reviewerReviewerApprovalPanel(de).approval}</h2>
      {data.approvedBy && data.approvedAtIso ? (
        <p className="mt-1" data-testid="reviewer-approval-line">
          {c_reviewerReviewerApprovalPanel(de).lastApprovedBy} <strong>{data.approvedBy}</strong> · {c_reviewerReviewerApprovalPanel(de).version} {data.versionLabel} · {date(data.approvedAtIso)}
        </p>
      ) : (
        <p className="mt-1 text-subtle">{c_reviewerReviewerApprovalPanel(de).thisCourseHasNotBeen}</p>
      )}
      {data.sinceOwn === null && <p className="mt-1 text-subtle">{c_reviewerReviewerApprovalPanel(de).youHaveNotApprovedThis}</p>}
      {data.sinceOwn && data.sinceOwn.count > 0 && (
        <div className="mt-2" data-testid="reviewer-changes">
          <p className="font-medium text-warning-text">
            {data.sinceOwn.count} {de ? (data.sinceOwn.count === 1 ? "Änderung seit deiner letzten Freigabe" : "Änderungen seit deiner letzten Freigabe") : data.sinceOwn.count === 1 ? "change since your last approval" : "changes since your last approval"}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {data.sinceOwn.sections.map((c) => (
              <li key={`s-${c.id}`}>{c_reviewerReviewerApprovalPanel(de).lesson} {de ? CHANGE_DE[c.change] : CHANGE_EN[c.change]}: {c.label}</li>
            ))}
            {data.sinceOwn.questions.map((c) => (
              <li key={`q-${c.id}`}>{c_reviewerReviewerApprovalPanel(de).question} {de ? CHANGE_DE[c.change] : CHANGE_EN[c.change]}: {c.label}</li>
            ))}
          </ul>
        </div>
      )}
      {upToDate ? (
        <p className="mt-2 text-subtle" data-testid="reviewer-approval-current">{c_reviewerReviewerApprovalPanel(de).noChangesSinceYourLast}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-background p-3" data-testid="reviewer-approval-form">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label={c_reviewerReviewerApprovalPanel(de).nameShownWithTheApproval} placeholder={c_reviewerReviewerApprovalPanel(de).yourNameShown} className="rounded-md border border-border bg-surface px-2 py-1" />
          <label className="flex min-h-11 items-start gap-2">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4" data-testid="reviewer-confirm" />
            <span>{c_reviewerReviewerApprovalPanel(de).iHaveProfessionallyReviewedThe}</span>
          </label>
          <Button size="sm" className="w-fit" disabled={busy || !canApprove || !confirmed || name.trim().length < 2} onClick={() => void approve()} data-testid="reviewer-approve">
            {c_reviewerReviewerApprovalPanel(de).approve}
          </Button>
          {!canApprove && <p className="text-warning-text" data-testid="reviewer-approve-locked">{c_reviewerReviewerApprovalPanel(de).youCanApproveOnlyAfter}</p>}
          {error && <p role="alert" className="text-danger-text">{error}</p>}
        </div>
      )}
    </section>
  );
}
