"use client";

import { useState } from "react";
import { Check, Flag, X } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import type { AnswerConfidence, QuizQuestion } from "@/lib/types";

type ReportReason = "incorrect" | "unclear" | "outdated";

const REPORT_REASON_LABEL: Record<ReportReason, { de: string; en: string }> = {
  incorrect: { de: "Falsch", en: "Incorrect" },
  unclear: { de: "Unklar", en: "Unclear" },
  outdated: { de: "Veraltet", en: "Outdated" },
};

interface QuizQuestionCardProps {
  question: QuizQuestion;
  onAnswered: (isCorrect: boolean, selectedIndex: number, confidence?: AnswerConfidence) => void;
  /** R1.4: knappe Quellenangabe (z. B. "S. 4") für die Lernansicht - die
   * vollständige Angabe (Quelle, Titel, ...) bleibt dem Adminbereich
   * vorbehalten (roadmap.md: "knapp" vs. "vollständig"). */
  sourceReference?: string | null;
  /** R2 (roadmap.md): "Sicherheit der eigenen Antwort abfragen" - wenn
   * gesetzt, wird zwischen Options-Auswahl und Aufdeckung der Korrektheit
   * ein Zwischenschritt eingefügt, der die Selbsteinschätzung erfasst
   * (muss VOR der Aufdeckung erfasst werden, sonst ist sie keine echte
   * Selbsteinschätzung mehr). Standardmäßig aus, damit bestehende
   * Aufrufer (z. B. RemediationSession) unverändert bleiben. */
  askConfidence?: boolean;
}

const CONFIDENCE_LABEL: Record<AnswerConfidence, { de: string; en: string }> = {
  guessed: { de: "Geraten", en: "Guessed" },
  unsure: { de: "Unsicher", en: "Unsure" },
  sure: { de: "Sicher", en: "Sure" },
};

export function QuizQuestionCard({
  question,
  onAnswered,
  sourceReference,
  askConfidence = false,
}: QuizQuestionCardProps) {
  const { locale, t } = useLocale();
  const [selected, setSelected] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<AnswerConfidence | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportedAs, setReportedAs] = useState<ReportReason | null>(null);

  const revealed = askConfidence ? confidence !== null : selected !== null;

  function handleSelect(index: number) {
    if (selected !== null) return;
    setSelected(index);
    if (!askConfidence) {
      onAnswered(index === question.correctIndex, index);
    }
  }

  function handleConfidence(level: AnswerConfidence) {
    if (selected === null || confidence !== null) return;
    setConfidence(level);
    onAnswered(selected === question.correctIndex, selected, level);
  }

  async function handleReport(reason: ReportReason) {
    if (reportedAs !== null) return;
    setReportedAs(reason);
    try {
      await fetch("/api/content-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "question", targetId: question.id, reason }),
      });
    } catch {
      // R6 (roadmap.md): eine fehlgeschlagene Meldung darf den Lernfluss
      // nicht unterbrechen - die Bestätigung bleibt stehen, ein erneuter
      // Versuch beim nächsten Mal ist unschädlich (keine Unique-Sperre).
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="mb-4 font-medium">{question.question[locale]}</p>

      <div className="flex flex-col gap-2">
        {question.options[locale].map((option, index) => {
          const isSelected = selected === index;
          const isCorrectOption = index === question.correctIndex;
          const showState = revealed;

          let stateClasses = "border-border hover:bg-background";
          if (showState && isCorrectOption) {
            stateClasses = "border-emerald-500 bg-emerald-500/10";
          } else if (showState && isSelected && !isCorrectOption) {
            stateClasses = "border-red-500 bg-red-500/10";
          } else if (isSelected) {
            stateClasses = "border-accent bg-accent/10";
          }

          return (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(index)}
              disabled={selected !== null}
              className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${stateClasses}`}
            >
              <span>{option}</span>
              {showState && isCorrectOption && (
                <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              )}
              {showState && isSelected && !isCorrectOption && (
                <X className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {askConfidence && selected !== null && confidence === null && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-foreground/70">
            {locale === "de" ? "Wie sicher warst du dir?" : "How sure were you?"}
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CONFIDENCE_LABEL) as AnswerConfidence[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => handleConfidence(level)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-accent hover:bg-background"
              >
                {CONFIDENCE_LABEL[level][locale]}
              </button>
            ))}
          </div>
        </div>
      )}

      {revealed && (
        <div className="mt-4 rounded-md bg-background p-3 text-sm">
          <p className="mb-1 font-medium">
            {selected === question.correctIndex ? t.lesson.correct : t.lesson.incorrect}
          </p>
          <p className="text-foreground/70">{question.explanation[locale]}</p>
          {sourceReference && (
            <p className="mt-2 text-xs text-foreground/50">
              {locale === "de" ? "Quelle" : "Source"}: {sourceReference}
            </p>
          )}

          <div className="mt-3 border-t border-border pt-2">
            {reportedAs ? (
              <p className="text-xs text-foreground/50">
                {locale === "de" ? "Danke, diese Frage wurde gemeldet." : "Thanks, this question was reported."}
              </p>
            ) : reportOpen ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-foreground/50">
                  {locale === "de" ? "Was stimmt nicht?" : "What's wrong?"}
                </span>
                {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => void handleReport(reason)}
                    className="rounded-md border border-border px-2 py-0.5 text-xs hover:border-accent hover:bg-surface"
                  >
                    {REPORT_REASON_LABEL[reason][locale]}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="flex items-center gap-1 text-xs text-foreground/40 hover:text-foreground/70"
              >
                <Flag className="h-3 w-3" aria-hidden="true" />
                {locale === "de" ? "Problem melden" : "Report a problem"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
