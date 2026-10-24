"use client";

import { useState } from "react";
import { OptionTile, type OptionState } from "@/components/quiz/OptionTile";
import { RichText } from "@/components/RichText";
import type { WovenQuestion } from "@/lib/server/weaving/candidates";
import type { Locale } from "@/lib/types";

/**
 * Eingewebte Frage nach einer gelösten Simulation (roadmap_didaktik Phase 10, Flag `woven_reviews`): eine fällige Frage aus einer früheren
 * Lektion in neuem Zusammenhang. Wird wie im Lektionstest nur als Review gebucht und zählt für nichts anderes.
 */
export function WovenStep({ sectionId, question, locale }: { sectionId: string; question: WovenQuestion; locale: Locale }) {
  const de = locale === "de";
  const [picked, setPicked] = useState<string | null>(null);
  const correct = question.options.find((o) => o.isCorrect);

  function pick(optionId: string) {
    if (picked) return;
    setPicked(optionId);
    void fetch(`/api/sections/${sectionId}/woven`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.id, selectedOptionId: optionId }),
    }).catch(() => {});
  }

  const stateOf = (id: string, isCorrect: boolean): OptionState => (!picked ? "neutral" : isCorrect ? "correct" : id === picked ? "wrong" : "dimmed");
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-4" data-testid="woven-step">
      <p className="text-xs font-semibold text-subtle">{de ? "Kurz aufgefrischt: noch eine Frage von früher (zählt nicht für diese Lektion)" : "A quick refresher from earlier (does not count for this lesson)"}</p>
      <div className="my-2 text-[15px] font-medium">
        <RichText text={question.question[locale]} />
      </div>
      <div className="flex flex-col gap-2">
        {question.options.map((o, i) => (
          <OptionTile key={o.id} index={i} state={stateOf(o.id, o.isCorrect)} disabled={picked !== null} onClick={() => pick(o.id)} stateLabel={picked && (o.isCorrect ? (de ? "richtig" : "correct") : o.id === picked ? (de ? "falsch" : "wrong") : undefined) || undefined}>
            <RichText text={o.text[locale]} />
          </OptionTile>
        ))}
      </div>
      {picked && (
        <div className="mt-2 text-sm text-text-2" data-testid="woven-step-result">
          <p className="font-semibold">{correct && picked === correct.id ? (de ? "Genau." : "Exactly.") : de ? "Hier fehlt noch ein Zwischenschritt." : "A step is still missing here."}</p>
          <RichText text={question.explanation[locale]} />
        </div>
      )}
    </div>
  );
}
