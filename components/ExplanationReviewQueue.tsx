"use client";

import { useEffect, useState } from "react";
import { RichText } from "@/components/RichText";

type Kind = "worked_example" | "analogy" | "example";
interface Draft {
  id: string;
  objectiveCode: string;
  objectiveTitle: string;
  kind: Kind;
  content: { de: string; en: string };
}
interface Counts {
  draft: number;
  approved: number;
  rejected: number;
}

const KIND_LABEL: Record<Kind, { de: string; en: string }> = {
  worked_example: { de: "Gelöstes Beispiel", en: "Worked example" },
  analogy: { de: "Vergleich aus dem Alltag", en: "Everyday analogy" },
  example: { de: "Anderes Beispiel", en: "Other example" },
};

/** Werkstatt: KI-Entwürfe der Alternativerklärungen prüfen, bei Bedarf überarbeiten, freigeben oder verwerfen. Nur Freigegebenes sehen Lernende. */
export function ExplanationReviewQueue({ certificationId, locale }: { certificationId: string; locale: "de" | "en" }) {
  const de = locale === "de";
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [edits, setEdits] = useState<Record<string, { de: string; en: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/certifications/${certificationId}/explanations`, { cache: "no-store" });
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
      const res = await fetch(`/api/admin/explanations/${draft.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ...(edits[draft.id] ? { content: edits[draft.id] } : {}) }),
      });
      if (!res.ok) throw new Error("failed");
      setDrafts((current) => (current ?? []).filter((d) => d.id !== draft.id));
      setCounts((c) => (c ? { ...c, draft: c.draft - 1, [decision === "approved" ? "approved" : "rejected"]: c[decision === "approved" ? "approved" : "rejected"] + 1 } : c));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4" data-testid="explanation-review">
      <h3 className="mb-1 font-medium">{de ? "Alternativerklärungen (Verstehens-Modus)" : "Alternative explanations (understanding mode)"}</h3>
      {counts && (
        <p className="mb-3 text-xs text-foreground/60">
          {de ? `${counts.approved} freigegeben, ${counts.draft} Entwürfe, ${counts.rejected} verworfen.` : `${counts.approved} approved, ${counts.draft} drafts, ${counts.rejected} rejected.`}
        </p>
      )}
      {drafts === null ? (
        <p className="text-sm text-foreground/60">{de ? "Lädt …" : "Loading …"}</p>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-foreground/60">{de ? "Keine Entwürfe zur Prüfung." : "No drafts to review."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {drafts.map((d) => {
            const value = edits[d.id] ?? d.content;
            return (
              <li key={d.id} className="rounded-md border border-border bg-background p-3" data-testid="explanation-draft">
                <p className="mb-2 text-xs font-medium">
                  {d.objectiveCode} · {d.objectiveTitle} · {KIND_LABEL[d.kind][locale]}
                </p>
                <div className="mb-2 text-sm">
                  <RichText text={value[locale]} />
                </div>
                <details className="mb-2 text-xs">
                  <summary className="cursor-pointer">{de ? "Text bearbeiten" : "Edit text"}</summary>
                  {(["de", "en"] as const).map((lang) => (
                    <textarea
                      key={lang}
                      aria-label={lang === "de" ? "Deutsch" : "English"}
                      value={value[lang]}
                      onChange={(e) => setEdits((cur) => ({ ...cur, [d.id]: { ...value, [lang]: e.target.value } }))}
                      rows={5}
                      className="mt-2 w-full rounded-md border border-border bg-surface px-2 py-1"
                    />
                  ))}
                </details>
                <div className="flex gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => void decide(d, "approved")} data-testid="explanation-approve" className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-accent disabled:opacity-50">
                    {de ? "Freigeben" : "Approve"}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void decide(d, "rejected")} className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-accent disabled:opacity-50">
                    {de ? "Verwerfen" : "Reject"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
