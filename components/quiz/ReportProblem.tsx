"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/lib/i18n";

type ReportReason = "incorrect" | "unclear" | "outdated";

/** „Frage melden“ (bestehende Meldefunktion /api/content-reports). Ein Fehler beim Senden unterbricht den Lernfluss nie. */
export function ReportProblem({ questionId, lessonId, label }: { questionId?: string; lessonId?: string; label?: string }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const reasons: Array<[ReportReason, string]> = [
    ["incorrect", t.quiz.reasonIncorrect],
    ["unclear", t.quiz.reasonUnclear],
    ["outdated", t.quiz.reasonOutdated],
  ];

  async function send(reason: ReportReason) {
    if (reported) return;
    setReported(true);
    try {
      await fetch("/api/content-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lessonId ? { targetType: "lesson", targetId: lessonId, reason } : { targetType: "question", targetId: questionId, reason }),
      });
    } catch {
      // R6 (roadmap.md): eine fehlgeschlagene Meldung darf den Lernfluss nicht unterbrechen.
    }
  }

  if (reported) return <p className="text-xs text-faint">{t.quiz.reportThanks}</p>;
  if (open) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-faint">{t.quiz.reportAsk}</span>
        {reasons.map(([reason, label]) => (
          <button key={reason} type="button" onClick={() => void send(reason)} className="min-h-8 rounded-md border border-border-strong px-2.5 text-xs hover:bg-surface-2">
            {label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(true)} className="flex min-h-8 items-center gap-1.5 rounded-md px-1 text-xs text-subtle hover:text-foreground">
      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
      {label ?? t.quiz.report}
    </button>
  );
}
