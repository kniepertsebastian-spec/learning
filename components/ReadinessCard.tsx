import { c_readinessCard } from "@/lib/i18n/components/readinessCard";
import { Gauge } from "lucide-react";
import type { Locale } from "@/lib/types";
import type { ReadinessLevel, ReadinessResult } from "@/lib/server/readiness/engine";

const LEVEL_LABEL: Record<ReadinessLevel, { de: string; en: string }> = {
  WELL_PREPARED: { de: "Gut vorbereitet", en: "Well prepared" },
  ADEQUATELY_PREPARED: { de: "Angemessen vorbereitet", en: "Adequately prepared" },
  SOMEWHAT_PREPARED: { de: "Teilweise vorbereitet", en: "Somewhat prepared" },
  NEEDS_PREPARATION: { de: "Noch nicht ausreichend vorbereitet", en: "Needs more preparation" },
  INSUFFICIENT_DATA: { de: "Noch zu wenig Daten", en: "Not enough data yet" },
};

const LEVEL_COLOR: Record<ReadinessLevel, string> = {
  WELL_PREPARED: "text-success-text",
  ADEQUATELY_PREPARED: "text-info-text",
  SOMEWHAT_PREPARED: "text-warning-text",
  NEEDS_PREPARATION: "text-danger-text",
  INSUFFICIENT_DATA: "text-faint",
};

function confidenceLabel(confidence: number, locale: Locale): string {
  if (confidence >= 0.7) return c_readinessCard(locale).highConfidence;
  if (confidence >= 0.4) return c_readinessCard(locale).mediumConfidence;
  return c_readinessCard(locale).lowConfidence;
}

/**
 * R2.5 (roadmap.md): zeigt das Ergebnis von computeReadiness() - bewusst
 * eine reine Server-Komponente ohne Client-JS: das "Warum?" nutzt ein
 * natives <details>/<summary>-Element statt React-State.
 */
export function ReadinessCard({ locale, readiness }: { locale: Locale; readiness: ReadinessResult }) {
  const { score, level, confidence, breakdown } = readiness;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Gauge className="h-4 w-4" aria-hidden="true" />
          {c_readinessCard(locale).examReadiness}
        </h2>
        <span className="text-xs text-faint">{confidenceLabel(confidence, locale)}</span>
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${LEVEL_COLOR[level]}`}>
          {score !== null ? `${score}%` : "–"}
        </span>
        <span className={`text-sm font-medium ${LEVEL_COLOR[level]}`}>{LEVEL_LABEL[level][locale]}</span>
      </div>

      {level === "INSUFFICIENT_DATA" && (
        <p className="mb-2 text-xs text-subtle">
          {c_readinessCard(locale).keepPracticingAReliableEstimate}
        </p>
      )}

      <details className="text-xs text-muted">
        <summary className="cursor-pointer select-none text-link hover:underline">
          {c_readinessCard(locale).whyThisEstimate}
        </summary>
        <ul className="mt-2 flex flex-col gap-1 pl-1">
          <li>
            {c_readinessCard(locale).objectiveCoverage}:{" "}
            {Math.round(breakdown.objectiveCoverage * 100)}%
          </li>
          <li>
            {c_readinessCard(locale).avgMasteryOfPracticedObjectives}:{" "}
            {Math.round(breakdown.avgMasteryOverAttempted)}%
          </li>
          <li>
            {c_readinessCard(locale).practiceRecency}:{" "}
            {Math.round(breakdown.recencyFactor * 100)}%
          </li>
          <li>
            {c_readinessCard(locale).recentMockExamTrend}:{" "}
            {breakdown.examTrend !== null
              ? `${Math.round(breakdown.examTrend)}%`
              : c_readinessCard(locale).noneTakenYet}
          </li>
        </ul>
      </details>
    </div>
  );
}
