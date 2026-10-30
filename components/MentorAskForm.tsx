"use client";

import { useState } from "react";

/**
 * „Ich hänge fest“ / „Mentor fragen“. Nur die lernende Person löst aus; sie sieht und bearbeitet die Zusammenfassung vor dem Senden.
 * Es geht ausschließlich dieser Text raus: keine Fehlversuche, Antworten oder Lernzeit werden automatisch ergänzt.
 */
export function MentorAskForm({ topic, certificationId, locale }: { topic: string; certificationId?: string | null; locale: "de" | "en" }) {
  const de = locale === "de";
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState("");
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const summary = `${de ? "Thema" : "Topic"}: ${topic}\n\n${de ? "Wo ich hänge" : "Where I am stuck"}: ${problem.trim()}${log.trim() ? `\n\n${de ? "Meldung / Log (von mir eingefügt)" : "Message / log (pasted by me)"}:\n${log.trim()}` : ""}`;

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/company/mentor-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, message: summary, certificationId: certificationId ?? null }) });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? (de ? "Das hat nicht geklappt." : "That did not work."));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return <p className="mt-2 text-sm" role="status" data-testid="mentor-ask-sent">{de ? "Gesendet. Dein Mentor meldet sich." : "Sent. Your mentor will get back to you."}</p>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="mentor-ask-open" className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface">
        {de ? "Ich hänge fest – Mentor fragen" : "I am stuck – ask my mentor"}
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-background p-3 text-sm" data-testid="mentor-ask-form">
      <label className="flex flex-col gap-1">
        {de ? "Wo hängst du? (in deinen Worten)" : "Where are you stuck? (in your own words)"}
        <textarea value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={1200} rows={3} className="rounded-md border border-border bg-surface px-2 py-1" data-testid="mentor-ask-problem" />
      </label>
      <label className="flex flex-col gap-1">
        {de ? "Fehlermeldung oder Log (optional, nur was du selbst einfügst)" : "Error message or log (optional, only what you paste yourself)"}
        <textarea value={log} onChange={(e) => setLog(e.target.value)} maxLength={600} rows={2} className="rounded-md border border-border bg-surface px-2 py-1" />
      </label>
      <div>
        <p className="font-medium">{de ? "Das geht an deinen Mentor:" : "This goes to your mentor:"}</p>
        <pre className="mt-1 whitespace-pre-wrap rounded-md bg-surface p-2 text-xs" data-testid="mentor-ask-summary">{summary}</pre>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={busy || problem.trim().length < 3} onClick={() => void send()} data-testid="mentor-ask-send" className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-surface disabled:opacity-50">
          {de ? "So senden" : "Send as shown"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-muted hover:bg-surface">
          {de ? "Abbrechen" : "Cancel"}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
    </div>
  );
}
