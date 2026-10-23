"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { OptionTile, type OptionState } from "@/components/quiz/OptionTile";
import { RichText } from "@/components/RichText";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { SectionQuizQuestion } from "@/components/SectionQuiz";

/**
 * Vorabfragen vor dem Lektionstext (roadmap_didaktik Phase 4.1). Ohne Wertung: Es wird nichts gespeichert, kein Review und
 * kein FSRS-Eintrag, und die richtige Antwort wird bewusst nicht gezeigt - die Lektion soll sie liefern. Dieselben Fragen
 * kommen im Lektionstest wieder (dann gewertet). Jederzeit überspringbar.
 */
export function LessonPretest({ questions, onDone }: { questions: SectionQuizQuestion[]; onDone: (outcome: "answered" | "skipped") => void }) {
  const { locale, t } = useLocale();
  const lp = t.lesson_page;
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const current = questions[index];
  const options = [...current.options].sort((a, b) => a.orderNum - b.orderNum);
  const last = index + 1 >= questions.length;

  function next() {
    if (last) return onDone("answered");
    setIndex(index + 1);
    setPicked(null);
  }

  return (
    <Card variant="hero" className="mb-8" data-testid="lesson-pretest">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Lightbulb className="h-4 w-4 text-link" aria-hidden="true" />
        {lp.pretestTitle} · {fmt(t.quiz.questionXofY, { x: index + 1, y: questions.length })}
      </div>
      <p className="mb-4 text-sm text-muted">{lp.pretestHint}</p>
      <div className="mb-4 text-lg font-semibold"><RichText text={current.question[locale]} /></div>
      <div role="radiogroup" aria-label={t.quiz.options} className="flex flex-col gap-2.5">
        {options.map((option, i) => {
          const state: OptionState = picked === null ? "neutral" : picked === i ? "selected" : "dimmed";
          return (
            <OptionTile key={option.id} index={i} state={state} disabled={picked !== null} onClick={() => setPicked(i)}>
              {option.text[locale]}
            </OptionTile>
          );
        })}
      </div>
      {picked !== null && <p className="mt-3 text-sm text-subtle" role="status">{lp.pretestNoted}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => onDone("skipped")} data-testid="pretest-skip">{lp.pretestSkip}</Button>
        <Button onClick={next} disabled={picked === null} data-testid="pretest-next">{last ? lp.pretestStart : t.quiz.nextShort}</Button>
      </div>
    </Card>
  );
}
