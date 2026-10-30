"use client";

import { c_examResultPrompt } from "@/lib/i18n/components/examResultPrompt";
import { fill } from "@/lib/i18n/fill";
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
    <section className="rounded-2xl border border-border bg-surface p-5" data-testid="exam-result-prompt" aria-label={c_examResultPrompt(de).examResult}>
      <p className="font-semibold">{fill(c_examResultPrompt(de).howDidYour0Exam, certName)}</p>
      <p className="mt-1 text-sm text-muted">{c_examResultPrompt(de).yourResultHelpsUsImprove}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void answer({ status: "passed" })}>{c_examResultPrompt(de).passed}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void answer({ status: "failed" })}>{c_examResultPrompt(de).notPassed}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void answer({ resultSnooze: true })}>{c_examResultPrompt(de).notYet}</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger-text">{c_examResultPrompt(de).couldNotSave}</p>}
    </section>
  );
}
