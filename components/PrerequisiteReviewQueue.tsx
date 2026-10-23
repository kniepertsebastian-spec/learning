"use client";

import { useEffect, useState } from "react";

interface Draft {
  id: string;
  conceptName: string;
  requiresName: string;
  topicArea: string;
}
interface Counts {
  draft: number;
  approved: number;
  rejected: number;
}

/** Werkstatt: von der KI vorgeschlagene Voraussetzungen zwischen Konzepten prüfen. Nur Freigegebenes steuert den Grundlagen-Check. */
export function PrerequisiteReviewQueue({ certificationId, locale }: { certificationId: string; locale: "de" | "en" }) {
  const de = locale === "de";
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/certifications/${certificationId}/prerequisites`, { cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as { drafts: Draft[]; counts: Counts };
        setDrafts(data.drafts);
        setCounts(data.counts);
      } catch {
        setDrafts([]);
      }
    })();
  }, [certificationId]);

  async function decide(draft: Draft, decision: "approved" | "rejected") {
    if (busy) return;
    setBusy(draft.id);
    try {
      const res = await fetch(`/api/admin/prerequisites/${draft.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      if (!res.ok) throw new Error("failed");
      setDrafts((current) => (current ?? []).filter((d) => d.id !== draft.id));
      setCounts((c) => (c ? { ...c, draft: c.draft - 1, [decision]: c[decision] + 1 } : c));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4" data-testid="prerequisite-review">
      <h3 className="mb-1 font-medium">{de ? "Voraussetzungen zwischen Konzepten" : "Concept prerequisites"}</h3>
      {counts && (
        <p className="mb-3 text-xs text-foreground/60">
          {de ? `${counts.approved} freigegeben, ${counts.draft} Vorschläge, ${counts.rejected} verworfen.` : `${counts.approved} approved, ${counts.draft} proposals, ${counts.rejected} rejected.`}
        </p>
      )}
      {drafts === null ? (
        <p className="text-sm text-foreground/60">{de ? "Lädt …" : "Loading …"}</p>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-foreground/60">{de ? "Keine Vorschläge zur Prüfung." : "No proposals to review."}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {drafts.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-2 text-sm" data-testid="prerequisite-draft">
              <span>
                <span className="font-medium">{d.conceptName}</span>
                <span className="text-foreground/70">{de ? " setzt voraus: " : " requires: "}</span>
                <span className="font-medium">{d.requiresName}</span>
                <span className="text-xs text-foreground/50"> · {d.topicArea}</span>
              </span>
              <span className="flex gap-2">
                <button type="button" disabled={busy !== null} onClick={() => void decide(d, "approved")} data-testid="prerequisite-approve" className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-accent disabled:opacity-50">
                  {de ? "Freigeben" : "Approve"}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void decide(d, "rejected")} className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-accent disabled:opacity-50">
                  {de ? "Verwerfen" : "Reject"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
