"use client";

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
      <h2 className="font-semibold">{de ? "Freigabe" : "Approval"}</h2>
      {data.approvedBy && data.approvedAtIso ? (
        <p className="mt-1" data-testid="reviewer-approval-line">
          {de ? "Zuletzt freigegeben von" : "Last approved by"} <strong>{data.approvedBy}</strong> · {de ? "Version" : "Version"} {data.versionLabel} · {date(data.approvedAtIso)}
        </p>
      ) : (
        <p className="mt-1 text-subtle">{de ? "Dieser Kurs ist noch nicht freigegeben." : "This course has not been approved yet."}</p>
      )}
      {data.sinceOwn === null && <p className="mt-1 text-subtle">{de ? "Du hast diesen Kurs noch nicht freigegeben: Prüfe bitte den ganzen Kurs." : "You have not approved this course yet: please review the whole course."}</p>}
      {data.sinceOwn && data.sinceOwn.count > 0 && (
        <div className="mt-2" data-testid="reviewer-changes">
          <p className="font-medium text-warning-text">
            {data.sinceOwn.count} {de ? (data.sinceOwn.count === 1 ? "Änderung seit deiner letzten Freigabe" : "Änderungen seit deiner letzten Freigabe") : data.sinceOwn.count === 1 ? "change since your last approval" : "changes since your last approval"}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {data.sinceOwn.sections.map((c) => (
              <li key={`s-${c.id}`}>{de ? "Lektion" : "Lesson"} {de ? CHANGE_DE[c.change] : CHANGE_EN[c.change]}: {c.label}</li>
            ))}
            {data.sinceOwn.questions.map((c) => (
              <li key={`q-${c.id}`}>{de ? "Frage" : "Question"} {de ? CHANGE_DE[c.change] : CHANGE_EN[c.change]}: {c.label}</li>
            ))}
          </ul>
        </div>
      )}
      {upToDate ? (
        <p className="mt-2 text-subtle" data-testid="reviewer-approval-current">{de ? "Keine Änderungen seit deiner letzten Freigabe." : "No changes since your last approval."}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-background p-3" data-testid="reviewer-approval-form">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label={de ? "Name, der bei der Freigabe angezeigt wird" : "Name shown with the approval"} placeholder={de ? "Dein Name (wird angezeigt)" : "Your name (shown)"} className="rounded-md border border-border bg-surface px-2 py-1" />
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4" data-testid="reviewer-confirm" />
            <span>{de ? "Ich habe die Inhalte dieser Version fachlich geprüft." : "I have professionally reviewed the content of this version."}</span>
          </label>
          <Button size="sm" className="w-fit" disabled={busy || !canApprove || !confirmed || name.trim().length < 2} onClick={() => void approve()} data-testid="reviewer-approve">
            {de ? "Freigeben" : "Approve"}
          </Button>
          {!canApprove && <p className="text-warning-text" data-testid="reviewer-approve-locked">{de ? "Freigeben kannst du erst nach dem Probe-Review (oder wenn der Betreiber dich freischaltet)." : "You can approve only after the trial review (or when the operator clears you)."}</p>}
          {error && <p role="alert" className="text-danger-text">{error}</p>}
        </div>
      )}
    </section>
  );
}
