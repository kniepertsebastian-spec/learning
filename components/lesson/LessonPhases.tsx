"use client";

import { Check } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/quiz/keys";
import { useLessonSimulations } from "./LessonSimulations";

type State = "done" | "current" | "todo";

/**
 * Lernablauf einer Lektion (roadmap3.md, Schritt 5): Verstehen (Text), Anwenden (Simulationen, nur wenn die Lektion welche
 * hat), Auswerten (Fragen bzw. Abschluss). Jeder Schritt springt an die Stelle; der Stand kommt aus den gelösten
 * Simulationen und dem Fortschritt der Seite.
 */
export function LessonPhases({
  quizStarted,
  completed,
  hasEvaluation,
  pretest,
}: {
  quizStarted: boolean;
  completed: boolean;
  hasEvaluation: boolean;
  /** Vorabfragen: "pending" solange sie offen sind, "done" nach Beantworten oder Überspringen; ohne Angabe gibt es keinen Schritt. */
  pretest?: "pending" | "done";
}) {
  const { t } = useLocale();
  const lp = t.lesson_page;
  const sims = useLessonSimulations();
  const simCount = sims?.simCount ?? 0;
  const solvedCount = sims ? [...sims.solved.keys()].filter((i) => i < simCount).length : 0;

  const understood = solvedCount > 0 || quizStarted || completed;
  const applyDone = simCount > 0 && solvedCount === simCount;
  const steps: Array<{ key: string; label: string; sub?: string; state: State; go: () => void }> = [
    ...(pretest
      ? [{ key: "pretest", label: lp.phasePretest, state: (pretest === "done" ? "done" : "current") as State, go: () => document.querySelector('[data-testid="lesson-pretest"]')?.scrollIntoView({ behavior: "smooth", block: "center" }) }]
      : []),
    { key: "understand", label: lp.phaseUnderstand, state: pretest === "pending" ? "todo" : understood ? "done" : "current", go: () => document.querySelector('[data-testid="lesson-article"]')?.scrollIntoView({ behavior: "smooth", block: "start" }) },
  ];
  if (simCount > 0) {
    steps.push({
      key: "apply",
      label: lp.phaseApply,
      sub: fmt(lp.phaseApplyDone, { x: solvedCount, y: simCount }),
      state: applyDone ? "done" : understood || solvedCount > 0 ? "current" : "todo",
      go: () => document.querySelector('[data-testid="simulation-block"]')?.scrollIntoView({ behavior: "smooth", block: "center" }),
    });
  }
  if (hasEvaluation) {
    steps.push({
      key: "evaluate",
      label: lp.phaseEvaluate,
      state: completed ? "done" : quizStarted || (applyDone && simCount > 0) ? "current" : "todo",
      go: () => document.querySelector('[data-testid="quiz-hero"], [data-testid="lesson-complete"]')?.scrollIntoView({ behavior: "smooth", block: "center" }),
    });
  }
  if (steps.length < 2) return null;

  return (
    <ol className="mb-6 flex flex-wrap gap-2" aria-label={lp.phasesLabel} data-testid="lesson-phases">
      {steps.map((s, i) => (
        <li key={s.key}>
          <button
            type="button"
            onClick={s.go}
            aria-current={s.state === "current" ? "step" : undefined}
            data-state={s.state}
            className={cn(
              "flex min-h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium",
              s.state === "done" && "border-mint-border bg-mint-soft text-mint-text",
              s.state === "current" && "border-accent-border bg-accent-soft text-foreground",
              s.state === "todo" && "border-border-strong text-muted hover:text-foreground",
            )}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-[11px]" aria-hidden="true">
              {s.state === "done" ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {s.label}
            {s.sub && <span className="text-xs font-normal text-subtle">{s.sub}</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}
