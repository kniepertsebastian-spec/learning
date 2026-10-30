"use client";

import { c_todayDashboard } from "@/lib/i18n/components/todayDashboard";
import { fill } from "@/lib/i18n/fill";
import { useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { CalendarCheck, Flame, Loader2, Sparkles, Target, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Locale } from "@/lib/types";

export interface TodayDashboardWeakObjective {
  objectiveId: string;
  objectiveTitle: string;
  domainName: string;
  masteryScore: number;
}

export interface TodayDashboardCategoryBreakdown {
  review: number;
  weak: number;
  new: number;
  lesson: number;
}

export interface TodayDashboardData {
  sessionId: string;
  certificationId: string;
  sessionStatus: "planned" | "in_progress" | "completed" | "skipped" | "abandoned";
  estimatedMinutes: number;
  dueCount: number;
  streak: number;
  /** Wochenziel („x von 4 Lerntagen“). */
  weekly?: { days: number; goal: number };
  /** Nach einer Pause von mindestens 7 Tagen: keine Rückstand-Zahl. */
  welcomeBack?: boolean;
  dailyGoalType: "minutes" | "questions";
  dailyGoalValue: number;
  weakObjectives: TodayDashboardWeakObjective[];
  categoryBreakdown: TodayDashboardCategoryBreakdown;
  feedback: boolean | null;
  /** R2 (roadmap.md): "sanfter Comeback-Modus nach Pause" - ob diese Session
   * nach einer längeren Lernpause gebaut wurde (siehe isComebackSession() in
   * session-builder.ts), dann bewusst mit mehr Wiederholung statt neuem
   * Stoff zusammengesetzt. */
  isComeback: boolean;
  /** „Pause für heute“: schon beantwortete Fragen der pausierten Session. */
  paused?: { answered: number } | null;
}

/** R2 (roadmap.md, neue Fassung): "Empfehlungen mit Gründen anzeigen" - baut
 * aus der Kategorie-Aufteilung (getSessionCategoryBreakdown()) einen kurzen,
 * lesbaren Satz statt nur Zahlen zu zeigen. Rein textuell, keine weitere
 * Berechnung. */
function buildReasoningText(locale: Locale, breakdown: TodayDashboardCategoryBreakdown): string | null {
  const parts: string[] = [];
  if (breakdown.review > 0) {
    parts.push(
      locale === "de"
        ? `${breakdown.review} fällige Wiederholung${breakdown.review === 1 ? "" : "en"}`
        : `${breakdown.review} due review${breakdown.review === 1 ? "" : "s"}`,
    );
  }
  if (breakdown.weak > 0) {
    parts.push(
      locale === "de"
        ? `${breakdown.weak} Frage${breakdown.weak === 1 ? "" : "n"} aus schwachen Bereichen`
        : `${breakdown.weak} question${breakdown.weak === 1 ? "" : "s"} from weak areas`,
    );
  }
  if (breakdown.new > 0) {
    parts.push(
      locale === "de"
        ? `${breakdown.new} neue${breakdown.new === 1 ? "" : ""} Frage${breakdown.new === 1 ? "" : "n"}`
        : `${breakdown.new} new question${breakdown.new === 1 ? "" : "s"}`,
    );
  }
  if (breakdown.lesson > 0) {
    parts.push(
      locale === "de"
        ? `${breakdown.lesson} Lektion${breakdown.lesson === 1 ? "" : "en"} zum Wiederholen`
        : `${breakdown.lesson} lesson${breakdown.lesson === 1 ? "" : "s"} to review`,
    );
  }
  if (parts.length === 0) return null;
  const joined = parts.join(c_todayDashboard(locale).and);
  return fill(c_todayDashboard(locale).includes0, joined);
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
  const [feedback, setFeedback] = useState(data.feedback);
  const [sendingFeedback, setSendingFeedback] = useState(false);

  const [startingMore, setStartingMore] = useState(false);
  async function handleMore() {
    if (startingMore) return;
    setStartingMore(true);
    try {
      const response = await fetch("/api/study-sessions/more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificationId: data.certificationId }),
      });
      if (response.ok) router.refresh();
    } finally {
      setStartingMore(false);
    }
  }

  async function handleSkip() {
    setSkipping(true);
    try {
      await fetch(`/api/study-sessions/${data.sessionId}/skip`, { method: "POST" });
      router.refresh();
    } finally {
      setSkipping(false);
    }
  }

  async function handleFeedback(helpful: boolean) {
    if (sendingFeedback) return;
    setSendingFeedback(true);
    const previous = feedback;
    setFeedback(helpful);
    try {
      const response = await fetch(`/api/study-sessions/${data.sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful }),
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
    } catch {
      setFeedback(previous);
    } finally {
      setSendingFeedback(false);
    }
  }

  if (data.sessionStatus === "completed") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-success-border bg-success-soft px-4 py-3 text-sm text-success-text">
        <span>{c_todayDashboard(locale).alreadyDoneForTodayNice}</span>
        {data.weekly && (
          <span className="flex items-center gap-1 font-medium" data-testid="weekly-goal">
            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {fill(c_todayDashboard(locale).n0Of1StudyDays, data.weekly.days, data.weekly.goal)}
          </span>
        )}
        {data.streak > 0 && (
          <span className="flex items-center gap-1 font-medium">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {data.streak} {c_todayDashboard(locale).dayStreak}
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleMore()}
          disabled={startingMore}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-60"
        >
          {startingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {c_todayDashboard(locale).studyMore}
        </button>
      </div>
    );
  }

  if (data.sessionStatus === "skipped") {
    return (
      <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
        {c_todayDashboard(locale).pausedForTodayBackTomorrow}
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div className="hero-surface rounded-2xl border p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-2xs font-semibold tracking-overline text-link uppercase">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {data.welcomeBack ? (c_todayDashboard(locale).welcomeBackJust5Minutes) : c_todayDashboard(locale).todaySSession}
        </h2>
        {data.weekly && (
          <span className="flex items-center gap-1 text-xs font-medium text-muted" data-testid="weekly-goal">
            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {fill(c_todayDashboard(locale).n0Of1StudyDays, data.weekly.days, data.weekly.goal)}
          </span>
        )}
        {data.streak > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-warning-text">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {data.streak} {c_todayDashboard(locale).dayStreak}
          </span>
        )}
      </div>

      {data.isComeback && (
        <p className="mb-3 text-xs text-muted">
          {c_todayDashboard(locale).welcomeBackWeReStarting}
        </p>
      )}

      <p className="mb-3 text-xl font-semibold tracking-tight">
        {fill(c_todayDashboard(locale).about0MinutesForToday, data.estimatedMinutes)}
      </p>

      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {data.welcomeBack
            ? c_todayDashboard(locale).theRestIsSpreadOver
            : `${data.dueCount} ${c_todayDashboard(locale).dueReviews}`}
        </span>
        <span className="flex items-center gap-1">
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          {c_todayDashboard(locale).dailyGoal}: {data.dailyGoalValue}{" "}
          {data.dailyGoalType === "minutes"
            ? c_todayDashboard(locale).min
            : c_todayDashboard(locale).questions}
        </span>
      </div>

      {(() => {
        const reasoning = buildReasoningText(locale, data.categoryBreakdown);
        return reasoning ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-subtle">{reasoning}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleFeedback(true)}
                aria-pressed={feedback === true}
                aria-label={c_todayDashboard(locale).recommendationHelpful}
                className={`flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-2 ${feedback === true ? "text-link" : "text-faint"}`}
              >
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void handleFeedback(false)}
                aria-pressed={feedback === false}
                aria-label={c_todayDashboard(locale).recommendationNotHelpful}
                className={`flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-2 ${feedback === false ? "text-link" : "text-faint"}`}
              >
                <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null;
      })()}

      {data.weakObjectives.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-muted">
            {c_todayDashboard(locale).focusAreasToday}
          </p>
          <ul className="flex flex-col gap-1">
            {data.weakObjectives.map((objective) => (
              <li key={objective.objectiveId} className="text-xs text-muted">
                <span className="font-medium text-foreground">{objective.objectiveTitle}</span>
                {" - "}
                {fill(c_todayDashboard(locale).n0MasteredNeedsMorePractice, objective.masteryScore)}{" "}
                <span className="text-faint">({objective.domainName})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/cert/${certSlug}/session`}
          className={buttonVariants({ size: "md" })}
        >
          {data.paused
            ? fill(c_todayDashboard(locale).continue0QuestionsAlreadyAnswered, data.paused.answered)
            : fill(c_todayDashboard(locale).startLearning0Min, data.estimatedMinutes)}
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-faint hover:text-text-2"
        >
          {c_todayDashboard(locale).later}
        </button>
        <button
          type="button"
          onClick={() => void handleSkip()}
          disabled={skipping}
          className="flex items-center gap-1 text-xs text-faint hover:text-text-2 disabled:opacity-50"
        >
          {skipping && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
          {c_todayDashboard(locale).skipToday}
        </button>
        <a href="#study-goal" className="text-xs text-link hover:underline">
          {c_todayDashboard(locale).adjustGoal}
        </a>
      </div>
    </div>
  );
}
