"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/types";

/** Nachfrage zum Prüfungsergebnis auf der Startseite (roadmap_didaktik Phase 7). */
export function ExamResultPrompt({ planId, certName, locale }: { planId: string; certName: string; locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const de = locale === "de";

  async function answer(body: { status: "passed" | "failed" } | { resultSnooze: true }) {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/exam-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5" data-testid="exam-result-prompt" aria-label={de ? "Prüfungsergebnis" : "Exam result"}>
      <p className="font-semibold">{de ? `Wie lief deine Prüfung „${certName}“?` : `How did your “${certName}” exam go?`}</p>
      <p className="mt-1 text-sm text-muted">{de ? "Dein Ergebnis hilft uns, die Lernplanung zu verbessern." : "Your result helps us improve the study planning."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void answer({ status: "passed" })}>{de ? "Bestanden" : "Passed"}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void answer({ status: "failed" })}>{de ? "Nicht bestanden" : "Not passed"}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void answer({ resultSnooze: true })}>{de ? "Noch nicht" : "Not yet"}</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger-text">{de ? "Speichern fehlgeschlagen." : "Could not save."}</p>}
    </section>
  );
}
