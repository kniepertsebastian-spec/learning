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
  WELL_PREPARED: "text-green-600",
  ADEQUATELY_PREPARED: "text-blue-600",
  SOMEWHAT_PREPARED: "text-yellow-600",
  NEEDS_PREPARATION: "text-red-600",
  INSUFFICIENT_DATA: "text-foreground/50",
};

function confidenceLabel(confidence: number, locale: Locale): string {
  if (confidence >= 0.7) return locale === "de" ? "hohe Sicherheit" : "high confidence";
  if (confidence >= 0.4) return locale === "de" ? "mittlere Sicherheit" : "medium confidence";
  return locale === "de" ? "niedrige Sicherheit" : "low confidence";
}

/**
 * R2.5 (roadmap.md): zeigt das Ergebnis von computeReadiness() - bewusst
 * eine reine Server-Komponente ohne Client-JS: das "Warum?" nutzt ein
 * natives <details>/<summary>-Element statt React-State.
 */
export function ReadinessCard({ locale, readiness }: { locale: Locale; readiness: ReadinessResult }) {
  const { score, level, confidence, breakdown } = readiness;

  return (
    <div className="mb-6 rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Gauge className="h-4 w-4" aria-hidden="true" />
          {locale === "de" ? "Prüfungsreife" : "Exam readiness"}
        </h2>
        <span className="text-xs text-foreground/50">{confidenceLabel(confidence, locale)}</span>
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${LEVEL_COLOR[level]}`}>
          {score !== null ? `${score}%` : "–"}
        </span>
        <span className={`text-sm font-medium ${LEVEL_COLOR[level]}`}>{LEVEL_LABEL[level][locale]}</span>
      </div>

      {level === "INSUFFICIENT_DATA" && (
        <p className="mb-2 text-xs text-foreground/60">
          {locale === "de"
            ? "Übe weiter - eine verlässliche Einschätzung braucht mehr Daten (mehrere Objectives, wiederholte Übung, idealerweise eine Probeprüfung)."
            : "Keep practicing - a reliable estimate needs more data (several objectives, repeated practice, ideally a mock exam)."}
        </p>
      )}

      <details className="text-xs text-foreground/70">
        <summary className="cursor-pointer select-none text-accent hover:underline">
          {locale === "de" ? "Warum diese Einschätzung?" : "Why this estimate?"}
        </summary>
        <ul className="mt-2 flex flex-col gap-1 pl-1">
          <li>
            {locale === "de" ? "Abgedeckte Objectives" : "Objective coverage"}:{" "}
            {Math.round(breakdown.objectiveCoverage * 100)}%
          </li>
          <li>
            {locale === "de" ? "Ø Mastery der geübten Objectives" : "Avg. mastery of practiced objectives"}:{" "}
            {Math.round(breakdown.avgMasteryOverAttempted)}%
          </li>
          <li>
            {locale === "de" ? "Aktualität der Übung" : "Practice recency"}:{" "}
            {Math.round(breakdown.recencyFactor * 100)}%
          </li>
          <li>
            {locale === "de" ? "Trend der letzten Probeprüfungen" : "Recent mock exam trend"}:{" "}
            {breakdown.examTrend !== null
              ? `${Math.round(breakdown.examTrend)}%`
              : locale === "de"
                ? "noch keine absolviert"
                : "none taken yet"}
          </li>
        </ul>
      </details>
    </div>
  );
}
