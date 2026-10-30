"use client";

import { c_reviewerReviewerItemComment } from "@/lib/i18n/components/reviewerReviewerItemComment";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Kommentar oder „fehlerhaft“-Meldung (nur Fragen) zu einem Abschnitt oder einer Frage. */
export function ReviewerItemComment({ certId, targetType, targetId, locale, existing }: { certId: string; targetType: "section" | "question"; targetId: string; locale: "de" | "en"; existing: Array<{ kind: "comment" | "faulty"; text: string; status: "open" | "resolved" }> }) {
  const de = locale === "de";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(existing);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(kind: "comment" | "faulty") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/reviewer/courses/${certId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType, targetId, kind, text }) });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Fehler ${res.status}`);
      return;
    }
    setSent((s) => [{ kind, text: text.trim(), status: "open" }, ...s]);
    setText("");
    setOpen(false);
  }

  return (
    <div className="mt-2 text-xs" data-testid="reviewer-item-comment">
      {sent.map((c, i) => (
        <p key={i} className="mb-1 rounded-md bg-surface-2 px-2 py-1">
          <strong>{c.kind === "faulty" ? (c_reviewerReviewerItemComment(de).reportedAsFaulty) : c_reviewerReviewerItemComment(de).comment}</strong> ({c.status === "open" ? (c_reviewerReviewerItemComment(de).open) : c_reviewerReviewerItemComment(de).resolved}): {c.text}
        </p>
      ))}
      {!open ? (
        <button type="button" className="text-link hover:underline" onClick={() => setOpen(true)} data-testid="reviewer-comment-open">
          {c_reviewerReviewerItemComment(de).comment2}
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} aria-label={c_reviewerReviewerItemComment(de).comment} className="rounded-md border border-border bg-background px-2 py-1" data-testid="reviewer-comment-text" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy || text.trim().length < 3} onClick={() => void send("comment")} data-testid="reviewer-comment-send">
              {c_reviewerReviewerItemComment(de).sendComment}
            </Button>
            {targetType === "question" && (
              <Button size="sm" variant="secondary" disabled={busy || text.trim().length < 3} onClick={() => void send("faulty")} data-testid="reviewer-faulty-send">
                {c_reviewerReviewerItemComment(de).reportAsFaulty}
              </Button>
            )}
            <button type="button" className="text-subtle hover:underline" onClick={() => setOpen(false)}>
              {c_reviewerReviewerItemComment(de).cancel}
            </button>
          </div>
          {error && <p role="alert" className="text-danger-text">{error}</p>}
        </div>
      )}
    </div>
  );
}
