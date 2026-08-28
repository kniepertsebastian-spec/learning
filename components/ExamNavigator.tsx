"use client";

import { Flag } from "lucide-react";
import { useLocale } from "@/lib/i18n";

interface ExamNavigatorProps {
  total: number;
  currentIndex: number;
  answers: Array<number | null>;
  flagged: Set<number>;
  onJump: (index: number) => void;
}

export function ExamNavigator({ total, currentIndex, answers, flagged, onJump }: ExamNavigatorProps) {
  const { t } = useLocale();

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-foreground/70">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> {t.exam.answered}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full border border-border" /> {t.exam.unanswered}
        </span>
        <span className="flex items-center gap-1">
          <Flag className="h-3 w-3 text-amber-500" /> {t.exam.flagged}
        </span>
      </div>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {Array.from({ length: total }, (_, i) => {
          const isAnswered = answers[i] !== null;
          const isFlagged = flagged.has(i);
          const isCurrent = i === currentIndex;

          return (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-md border text-xs font-medium ${
                isCurrent
                  ? "border-accent ring-2 ring-accent/40"
                  : isAnswered
                    ? "border-accent bg-accent/10"
                    : "border-border"
              }`}
            >
              {i + 1}
              {isFlagged && (
                <Flag
                  className="absolute -right-1 -top-1 h-3 w-3 fill-amber-500 text-amber-500"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
