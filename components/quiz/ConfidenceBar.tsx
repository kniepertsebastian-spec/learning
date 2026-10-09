"use client";

import { Info } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import type { AnswerConfidence } from "@/lib/types";
import { Button } from "@/components/ui/button";

/** „Wie sicher bist du?“ – erst danach wird aufgedeckt. */
export function ConfidenceBar({ onPick }: { onPick: (level: AnswerConfidence) => void }) {
  const { t } = useLocale();
  const levels: Array<[AnswerConfidence, string]> = [
    ["guessed", t.quiz.guessed],
    ["unsure", t.quiz.unsure],
    ["sure", t.quiz.sure],
  ];
  return (
    <div className="anim-fade-in rounded-[14px] border border-border bg-surface-inset p-4" data-testid="confidence-bar">
      <p className="mb-2.5 text-sm font-semibold">{t.quiz.confidenceTitle}</p>
      <div className="flex flex-wrap gap-2">
        {levels.map(([level, label]) => (
          <Button key={level} variant="secondary" size="sm" onClick={() => onPick(level)} data-testid={`confidence-${level}`}>
            {label}
          </Button>
        ))}
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-xs text-faint">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        {t.quiz.confidenceHint}
      </p>
    </div>
  );
}
