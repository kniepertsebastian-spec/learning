"use client";

import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

const DIFFICULTY_KEY = { beginner: "difficultyBeginner", intermediate: "difficultyIntermediate", advanced: "difficultyAdvanced" } as const;

/** Kopf einer Frage: Objective-Pill, Schwierigkeit, rechts „Markieren“. */
export function QuestionHead({
  objectiveLabel,
  difficulty,
  flagged,
  onToggleFlag,
}: {
  objectiveLabel?: string;
  difficulty?: string | null;
  flagged?: boolean;
  onToggleFlag?: () => void;
}) {
  const { t } = useLocale();
  const diffKey = difficulty && difficulty in DIFFICULTY_KEY ? DIFFICULTY_KEY[difficulty as keyof typeof DIFFICULTY_KEY] : null;
  if (!objectiveLabel && !diffKey && !onToggleFlag) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {objectiveLabel && <Badge tone="info">{objectiveLabel}</Badge>}
      {diffKey && <Badge tone="neutral">{t.quiz[diffKey]}</Badge>}
      {onToggleFlag && (
        <button
          type="button"
          onClick={onToggleFlag}
          aria-pressed={flagged}
          data-testid="flag-question"
          className={cn("ml-auto flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium", flagged ? "bg-warning-soft text-warning-text" : "text-subtle hover:bg-surface-2 hover:text-foreground")}
        >
          <Flag className={cn("h-4 w-4", flagged && "fill-current")} aria-hidden="true" />
          {flagged ? t.quiz.flagged : t.quiz.flag}
        </button>
      )}
    </div>
  );
}
