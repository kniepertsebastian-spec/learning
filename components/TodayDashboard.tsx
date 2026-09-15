"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, Flame, Loader2, Sparkles, Target } from "lucide-react";
import type { Locale } from "@/lib/types";

export interface TodayDashboardWeakObjective {
  objectiveId: string;
  objectiveTitle: string;
  domainName: string;
  masteryScore: number;
}

export interface TodayDashboardData {
  sessionId: string;
  sessionStatus: "planned" | "in_progress" | "completed" | "skipped" | "abandoned";
  estimatedMinutes: number;
  dueCount: number;
  streak: number;
  dailyGoalType: "minutes" | "questions";
  dailyGoalValue: number;
  weakObjectives: TodayDashboardWeakObjective[];
}

/**
 * R2.4 (roadmap.md): "Heute lernen"-Dashboard - primäre CTA mit geschätzter
 * Dauer, fällige Reviews, Lernserie und Tagesziel, die drei wichtigsten
 * schwachen Objectives, sowie „Später", „Heute aussetzen" und eine
 * Zielanpassungs-Verknüpfung zum StudyGoalPanel.
 */
export function TodayDashboard({
  certSlug,
  locale,
  data,
}: {
  certSlug: string;
  locale: Locale;
  data: TodayDashboardData;
}) {
  const router = useRouter();
  // Bewusst ohne sessionStorage-Persistenz: "Später" blendet die Karte nur
  // für diese Ansicht aus (kein Hydration-Mismatch-Risiko durch
  // serverseitig unbekannten Browser-Zustand) - ein Reload zeigt sie wieder,
  // was für ein reines "jetzt nicht stören" ausreicht. "Heute aussetzen"
  // (siehe handleSkip) ist die Variante mit echter, geräteübergreifender
  // Wirkung.
  const [dismissed, setDismissed] = useState(false);
  const [skipping, setSkipping] = useState(false);

  async function handleSkip() {
    setSkipping(true);
    try {
      await fetch(`/api/study-sessions/${data.sessionId}/skip`, { method: "POST" });
      router.refresh();
    } finally {
      setSkipping(false);
    }
  }

  if (data.sessionStatus === "completed") {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <span>{locale === "de" ? "Heute schon erledigt - stark!" : "Already done for today - nice work!"}</span>
        {data.streak > 0 && (
          <span className="flex items-center gap-1 font-medium">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {data.streak} {locale === "de" ? "Tage in Folge" : "day streak"}
          </span>
        )}
      </div>
    );
  }

  if (data.sessionStatus === "skipped") {
    return (
      <div className="mb-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground/70">
        {locale === "de" ? "Heute pausiert - morgen geht's weiter." : "Paused for today - back tomorrow."}
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div className="mb-6 rounded-lg border border-accent/30 bg-accent/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
          {locale === "de" ? "Heute lernen" : "Today's session"}
        </h2>
        {data.streak > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-orange-600">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {data.streak} {locale === "de" ? "Tage in Folge" : "day streak"}
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-4 text-xs text-foreground/70">
        <span className="flex items-center gap-1">
          <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {data.dueCount} {locale === "de" ? "fällige Wiederholungen" : "due reviews"}
        </span>
        <span className="flex items-center gap-1">
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          {locale === "de" ? "Tagesziel" : "Daily goal"}: {data.dailyGoalValue}{" "}
          {data.dailyGoalType === "minutes"
            ? locale === "de"
              ? "Min."
              : "min"
            : locale === "de"
              ? "Fragen"
              : "questions"}
        </span>
      </div>

      {data.weakObjectives.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-foreground/70">
            {locale === "de" ? "Schwerpunkte heute:" : "Focus areas today:"}
          </p>
          <ul className="flex flex-col gap-1">
            {data.weakObjectives.map((objective) => (
              <li key={objective.objectiveId} className="text-xs text-foreground/70">
                <span className="font-medium text-foreground">{objective.objectiveTitle}</span>
                {" - "}
                {locale === "de"
                  ? `${objective.masteryScore}% gefestigt, noch Übung nötig`
                  : `${objective.masteryScore}% mastered, needs more practice`}{" "}
                <span className="text-foreground/50">({objective.domainName})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/cert/${certSlug}/session`}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {locale === "de"
            ? `Jetzt lernen (~${data.estimatedMinutes} Min.)`
            : `Start learning (~${data.estimatedMinutes} min)`}
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-foreground/50 hover:text-foreground/80"
        >
          {locale === "de" ? "Später" : "Later"}
        </button>
        <button
          type="button"
          onClick={() => void handleSkip()}
          disabled={skipping}
          className="flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground/80 disabled:opacity-50"
        >
          {skipping && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
          {locale === "de" ? "Heute aussetzen" : "Skip today"}
        </button>
        <a href="#study-goal" className="text-xs text-accent hover:underline">
          {locale === "de" ? "Ziel anpassen" : "Adjust goal"}
        </a>
      </div>
    </div>
  );
}
