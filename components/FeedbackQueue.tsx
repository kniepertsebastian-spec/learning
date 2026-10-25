"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import type { FeedbackCategory } from "@/lib/server/db/schema";

export interface FeedbackQueueItem {
  id: string;
  category: FeedbackCategory;
  message: string;
  createdAt: string;
  domainName: string | null;
  sectionTitle: { de: string; en: string } | null;
  sectionId: string | null;
  courseSlug: string;
}

const CATEGORY: Record<FeedbackCategory, { de: string; en: string }> = {
  bug: { de: "Technischer Fehler", en: "Bug" },
  typo: { de: "Tippfehler", en: "Typo" },
  content: { de: "Inhaltlich unstimmig", en: "Content issue" },
  other: { de: "Sonstiges", en: "Other" },
};

/** Offene Rückmeldungen („Problem melden“) eines Kurses mit Kontext und Sprung zur Lektion. Admins schließen sie ab, Prüfer lesen mit. */
export function FeedbackQueue({ items, locale, canResolve }: { items: FeedbackQueueItem[]; locale: "de" | "en"; canResolve: boolean }) {
  const de = locale === "de";
  const [list, setList] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(id: string, status: "resolved" | "dismissed") {
    if (busy) return;
    setBusy(id);
    try {
      const response = await fetch(`/api/admin/feedback/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (response.ok) setList((current) => current.filter((i) => i.id !== id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-6 rounded-lg border border-border bg-surface p-4" data-testid="feedback-queue">
      <h2 className="font-medium">{de ? "Rückmeldungen von Lernenden" : "Feedback from learners"} ({list.length})</h2>
      {list.length === 0 && <p className="mt-2 text-sm text-subtle">{de ? "Keine offenen Rückmeldungen." : "No open feedback."}</p>}
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {list.map((i) => (
          <li key={i.id} className="rounded-md border border-border bg-background p-3" data-testid="feedback-item">
            <p className="text-xs text-subtle">
              {CATEGORY[i.category][locale]}
              {i.domainName ? ` · ${i.domainName}` : ""}
              {i.sectionTitle && i.sectionId ? (
                <>
                  {" · "}
                  <Link href={`/cert/${i.courseSlug}/section/${i.sectionId}`} className="text-link hover:underline">{i.sectionTitle[locale]}</Link>
                </>
              ) : null}
              {" · "}
              {new Date(i.createdAt).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words">{i.message}</p>
            {canResolve && (
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy === i.id} onClick={() => void resolve(i.id, "resolved")} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-surface-2" data-testid="feedback-resolve">
                  <Check className="h-3 w-3" aria-hidden="true" />{de ? "Erledigt" : "Resolved"}
                </button>
                <button type="button" disabled={busy === i.id} onClick={() => void resolve(i.id, "dismissed")} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-surface-2">
                  <X className="h-3 w-3" aria-hidden="true" />{de ? "Verwerfen" : "Dismiss"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
