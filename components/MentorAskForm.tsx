"use client";

import { c_mentorAskForm } from "@/lib/i18n/components/mentorAskForm";
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

  const summary = `${c_mentorAskForm(de).topic}: ${topic}\n\n${c_mentorAskForm(de).whereIAmStuck}: ${problem.trim()}${log.trim() ? `\n\n${c_mentorAskForm(de).messageLogPastedByMe}:\n${log.trim()}` : ""}`;

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/company/mentor-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, message: summary, certificationId: certificationId ?? null }) });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? (c_mentorAskForm(de).thatDidNotWork));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return <p className="mt-2 text-sm" role="status" data-testid="mentor-ask-sent">{c_mentorAskForm(de).sentYourMentorWillGet}</p>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="mentor-ask-open" className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface">
        {c_mentorAskForm(de).iAmStuckAskMy}
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-background p-3 text-sm" data-testid="mentor-ask-form">
      <label className="flex flex-col gap-1">
        {c_mentorAskForm(de).whereAreYouStuckIn}
        <textarea value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={1200} rows={3} className="rounded-md border border-border bg-surface px-2 py-1" data-testid="mentor-ask-problem" />
      </label>
      <label className="flex flex-col gap-1">
        {c_mentorAskForm(de).errorMessageOrLogOptional}
        <textarea value={log} onChange={(e) => setLog(e.target.value)} maxLength={600} rows={2} className="rounded-md border border-border bg-surface px-2 py-1" />
      </label>
      <div>
        <p className="font-medium">{c_mentorAskForm(de).thisGoesToYourMentor}</p>
        <pre className="mt-1 whitespace-pre-wrap rounded-md bg-surface p-2 text-xs" data-testid="mentor-ask-summary">{summary}</pre>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={busy || problem.trim().length < 3} onClick={() => void send()} data-testid="mentor-ask-send" className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-surface disabled:opacity-50">
          {c_mentorAskForm(de).sendAsShown}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-muted hover:bg-surface">
          {c_mentorAskForm(de).cancel}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
    </div>
  );
}
