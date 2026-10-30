"use client";

import { c_adminCourseApprovalPanel } from "@/lib/i18n/components/adminCourseApprovalPanel";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Change = { id: string; label: string; change: "added" | "removed" | "changed" };
type ApprovalData = {
  state: "none" | "current" | "changed";
  approval: { reviewerDisplayName: string; versionLabel: string; approvedAt: string; kind: string } | null;
  changeCount: number;
  changes: { sections: Change[]; questions: Change[] } | null;
  history: Array<{ id: string; kind: "approval" | "editorial" | "legacy"; reviewerDisplayName: string; versionLabel: string; approvedAt: string; note: string | null }>;
};

const KIND_DE = { approval: "Freigabe", editorial: "redaktionell", legacy: "übernommen" } as const;
const KIND_EN = { approval: "approval", editorial: "editorial", legacy: "imported" } as const;
const CHANGE_DE = { added: "neu", removed: "entfernt", changed: "geändert" } as const;
const CHANGE_EN = { added: "new", removed: "removed", changed: "changed" } as const;

/**
 * Freigabestand eines allgemeinen Kurses in der Werkstatt (roadmap_pruefer Phase 2): wer hat welche Version wann freigegeben, ob sich der
 * Inhalt seitdem geändert hat (mit Liste), Neufreigabe mit Bestätigung und redaktionelle Übernahme kleiner Änderungen mit Notiz.
 */
export function CourseApprovalPanel({ certId, locale }: { certId: string; locale: "de" | "en" }) {
  const router = useRouter();
  const de = locale === "de";
  const [data, setData] = useState<ApprovalData | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/certifications/${certId}/approval`, { cache: "no-store" });
    if (res.ok) {
      const next = (await res.json()) as ApprovalData;
      setData(next);
      setName((current) => current || next.approval?.reviewerDisplayName || "");
    }
  }, [certId]);
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function send(url: string, method: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Fehler ${res.status}`);
      return false;
    }
    setConfirmed(false);
    setNote("");
    await load();
    router.refresh();
    return true;
  }

  if (!data) return null;
  const date = (iso: string) => new Date(iso).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" });
  const tone = data.state === "changed" ? "border-warning/50 bg-warning-soft" : "border-border bg-surface";

  return (
    <section className={`mb-6 rounded-lg border p-4 text-sm ${tone}`} data-testid="course-approval" data-state={data.state}>
      <h2 className="font-semibold">{c_adminCourseApprovalPanel(de).expertApproval}</h2>
      {data.state === "none" && <p className="mt-1 text-subtle" data-testid="approval-none">{c_adminCourseApprovalPanel(de).thisCourseIsNotApproved}</p>}
      {data.approval && (
        <p className="mt-1" data-testid="approval-line">
          {c_adminCourseApprovalPanel(de).reviewedBy} <strong>{data.approval.reviewerDisplayName}</strong> · {c_adminCourseApprovalPanel(de).version} {data.approval.versionLabel} · {date(data.approval.approvedAt)}
        </p>
      )}
      {data.state === "current" && <p className="mt-1 text-subtle" data-testid="approval-current">{c_adminCourseApprovalPanel(de).noChangesSinceTheReview}</p>}
      {data.state === "changed" && (
        <div className="mt-2" data-testid="approval-changed">
          <p className="font-medium text-warning-text">
            {data.changeCount} {de ? (data.changeCount === 1 ? "Änderung seit Prüfung" : "Änderungen seit Prüfung") : data.changeCount === 1 ? "change since review" : "changes since review"}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {data.changes?.sections.map((c) => (
              <li key={`s-${c.id}`}>{c_adminCourseApprovalPanel(de).lesson} {de ? CHANGE_DE[c.change] : CHANGE_EN[c.change]}: {c.label}</li>
            ))}
            {data.changes?.questions.map((c) => (
              <li key={`q-${c.id}`}>{c_adminCourseApprovalPanel(de).question} {de ? CHANGE_DE[c.change] : CHANGE_EN[c.change]}: {c.label}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {data.state !== "current" && (
          <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} data-testid="approval-open">
            {data.state === "none" ? (c_adminCourseApprovalPanel(de).approve) : c_adminCourseApprovalPanel(de).approveAgain}
          </Button>
        )}
      </div>
      {open && data.state !== "current" && (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-background p-3" data-testid="approval-form">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={c_adminCourseApprovalPanel(de).reviewerName} aria-label={c_adminCourseApprovalPanel(de).reviewerName} className="rounded-md border border-border bg-surface px-2 py-1" />
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4" data-testid="approval-confirm" />
            <span>{c_adminCourseApprovalPanel(de).iHaveProfessionallyReviewedThe}</span>
          </label>
          <Button size="sm" className="w-fit" disabled={busy || !confirmed || name.trim().length < 2} data-testid="approval-submit" onClick={() => void send(`/api/admin/certifications/${certId}/catalog`, "PATCH", { status: "approved", approvedByName: name, confirmed })}>
            {c_adminCourseApprovalPanel(de).saveApproval}
          </Button>
        </div>
      )}

      {data.state === "changed" && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center" data-testid="approval-editorial">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={c_adminCourseApprovalPanel(de).noteEGTypoFixed} aria-label={c_adminCourseApprovalPanel(de).editorialNote} className="flex-1 rounded-md border border-border bg-surface px-2 py-1" />
          <Button variant="secondary" size="sm" disabled={busy || note.trim().length < 3} onClick={() => void send(`/api/admin/certifications/${certId}/approval/editorial`, "POST", { note })}>
            {c_adminCourseApprovalPanel(de).acceptAsEditorial}
          </Button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-danger-text">{error}</p>}

      {data.history.length > 0 && (
        <details className="mt-3" data-testid="approval-history">
          <summary className="cursor-pointer text-xs text-subtle">{c_adminCourseApprovalPanel(de).history} ({data.history.length})</summary>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {data.history.map((h) => (
              <li key={h.id}>
                {date(h.approvedAt)} · {de ? KIND_DE[h.kind] : KIND_EN[h.kind]} · {h.versionLabel} · {h.reviewerDisplayName}
                {h.note ? ` · ${h.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
