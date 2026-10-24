"use client";

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
          <strong>{c.kind === "faulty" ? (de ? "Fehlerhaft gemeldet" : "Reported as faulty") : de ? "Kommentar" : "Comment"}</strong> ({c.status === "open" ? (de ? "offen" : "open") : de ? "erledigt" : "resolved"}): {c.text}
        </p>
      ))}
      {!open ? (
        <button type="button" className="text-link hover:underline" onClick={() => setOpen(true)} data-testid="reviewer-comment-open">
          {de ? "Kommentieren" : "Comment"}
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} aria-label={de ? "Kommentar" : "Comment"} className="rounded-md border border-border bg-background px-2 py-1" data-testid="reviewer-comment-text" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy || text.trim().length < 3} onClick={() => void send("comment")} data-testid="reviewer-comment-send">
              {de ? "Kommentar senden" : "Send comment"}
            </Button>
            {targetType === "question" && (
              <Button size="sm" variant="secondary" disabled={busy || text.trim().length < 3} onClick={() => void send("faulty")} data-testid="reviewer-faulty-send">
                {de ? "Als fehlerhaft melden" : "Report as faulty"}
              </Button>
            )}
            <button type="button" className="text-subtle hover:underline" onClick={() => setOpen(false)}>
              {de ? "Abbrechen" : "Cancel"}
            </button>
          </div>
          {error && <p role="alert" className="text-danger-text">{error}</p>}
        </div>
      )}
    </div>
  );
}
