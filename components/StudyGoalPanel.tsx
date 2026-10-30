"use client";

import { c_studyGoalPanel } from "@/lib/i18n/components/studyGoalPanel";
import { fill } from "@/lib/i18n/fill";
import { useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, Target } from "lucide-react";
import type { Locale } from "@/lib/types";
import { computeTimeOutlook, dailyMinutes } from "@/lib/study/time-outlook";
import { EXAM_DATE_HINT } from "@/lib/study/exam-date-hint";

export interface StudyGoalState {
  examDate: string | null;
  dailyGoalType: "minutes" | "questions";
  dailyGoalValue: number;
  activeDays: number[];
  preferredLocale: "de" | "en" | null;
  lightWeekdays: number[];
}

export const DEFAULT_GOAL: StudyGoalState = {
  examDate: null,
  dailyGoalType: "minutes",
  dailyGoalValue: 15,
  activeDays: [1, 2, 3, 4, 5, 6, 7],
  preferredLocale: null,
  lightWeekdays: [],
};

const WEEKDAYS: Array<{ day: number; de: string; en: string }> = [
  { day: 1, de: "Mo", en: "Mon" },
  { day: 2, de: "Di", en: "Tue" },
  { day: 3, de: "Mi", en: "Wed" },
  { day: 4, de: "Do", en: "Thu" },
  { day: 5, de: "Fr", en: "Fri" },
  { day: 6, de: "Sa", en: "Sat" },
  { day: 7, de: "So", en: "Sun" },
];

function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
}

/**
 * R2.1 (roadmap.md): Lernziel-Panel auf der Kursseite - Prüfungstermin,
 * Tagesziel (Minuten oder Fragen), aktive Lerntage und bevorzugte Sprache.
 * "Ziel jederzeit änderbar machen": ein erneutes Speichern überschreibt
 * einfach das bestehende Profil (PUT, kein separater Erstellungs-Schritt).
 */
export function StudyGoalPanel({
  certId,
  locale,
  initialGoal,
  neededMinutes = 0,
}: {
  certId: string;
  locale: Locale;
  initialGoal: StudyGoalState | null;
  /** Geschätzter Restaufwand in Minuten (Lektionen lesen, neue Fragen üben) für „Reicht die Zeit?“. */
  neededMinutes?: number;
}) {
  const [goal, setGoal] = useState<StudyGoalState>(initialGoal ?? DEFAULT_GOAL);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setSavedNote(null);
    try {
      const response = await fetch(`/api/study-profile/${certId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(goal),
      });
      const data = (await response.json()) as { profile?: unknown; error?: string };
      if (!response.ok) throw new Error(data.error ?? `Status ${response.status}`);
      setSavedNote(c_studyGoalPanel(locale).studyGoalSaved);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : c_studyGoalPanel(locale).saveFailed,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="study-goal" className="@container scroll-mt-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium">
        <Target className="h-4 w-4" aria-hidden="true" />
        {c_studyGoalPanel(locale).studyGoal}
      </h2>

      <div className="grid gap-3 @xl:grid-cols-3">
        <label className="block text-xs">
          <span className="mb-1 flex items-center gap-1 font-medium text-muted">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {c_studyGoalPanel(locale).examDateOptional}
          </span>
          <input
            type="date"
            value={goal.examDate ?? ""}
            onChange={(e) => setGoal({ ...goal, examDate: e.target.value || null })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
          <span className="mt-1 block text-2xs leading-snug text-subtle" data-testid="exam-date-hint-panel">{EXAM_DATE_HINT[locale]}</span>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-muted">
            {c_studyGoalPanel(locale).dailyGoal}
          </span>
          <div className="flex gap-1.5">
            <input
              type="number"
              min={1}
              value={goal.dailyGoalValue}
              onChange={(e) => setGoal({ ...goal, dailyGoalValue: Number(e.target.value) })}
              className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
            <select
              value={goal.dailyGoalType}
              onChange={(e) =>
                setGoal({ ...goal, dailyGoalType: e.target.value as StudyGoalState["dailyGoalType"] })
              }
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option value="minutes">{c_studyGoalPanel(locale).minutesDay}</option>
              <option value="questions">{c_studyGoalPanel(locale).questionsDay}</option>
            </select>
          </div>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-muted">
            {c_studyGoalPanel(locale).preferredContentLanguage}
          </span>
          <select
            value={goal.preferredLocale ?? ""}
            onChange={(e) =>
              setGoal({
                ...goal,
                preferredLocale: e.target.value === "" ? null : (e.target.value as "de" | "en"),
              })
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="">{c_studyGoalPanel(locale).noPreference}</option>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-xs font-medium text-muted">
          {c_studyGoalPanel(locale).activeStudyDays}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map(({ day, de, en }) => {
            const active = goal.activeDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => setGoal({ ...goal, activeDays: toggleDay(goal.activeDays, day) })}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent-soft text-link"
                    : "border-border text-subtle hover:bg-background"
                }`}
              >
                {locale === "de" ? de : en}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-xs font-medium text-muted">
          {c_studyGoalPanel(locale).lightDaysFewerReviews}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map(({ day, de, en }) => {
            const light = goal.lightWeekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={light}
                onClick={() => setGoal({ ...goal, lightWeekdays: toggleDay(goal.lightWeekdays, day) })}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  light
                    ? "border-accent bg-accent-soft text-link"
                    : "border-border text-subtle hover:bg-background"
                }`}
              >
                {locale === "de" ? de : en}
              </button>
            );
          })}
        </div>
      </div>

      {(() => {
        const de = locale === "de";
        const outlook = computeTimeOutlook({ examDate: goal.examDate, now: new Date(), activeDays: goal.activeDays, minutesPerDay: dailyMinutes(goal.dailyGoalType, goal.dailyGoalValue), neededMinutes });
        if (!goal.examDate || neededMinutes <= 0) return null;
        if (!outlook) {
          return (
            <p className="mt-3 text-xs text-subtle" data-testid="time-outlook">
              {c_studyGoalPanel(de).noEstimatePossibleWithThis}
            </p>
          );
        }
        const tone = outlook.status === "ok" ? "text-mint-text" : outlook.status === "tight" ? "text-warning-text" : "text-danger-text";
        const headline =
          outlook.status === "ok"
            ? c_studyGoalPanel(de).youHaveEnoughTime
            : outlook.status === "tight"
              ? c_studyGoalPanel(de).itWillBeTight
              : c_studyGoalPanel(de).thisIsNotEnoughTime;
        return (
          <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs" data-testid="time-outlook" data-status={outlook.status}>
            <p className={`font-medium ${tone}`}>{headline}</p>
            <p className="mt-1 text-muted">
              {fill(c_studyGoalPanel(de).untilTheExamYouHave, outlook.studyDays, dailyMinutes(goal.dailyGoalType, goal.dailyGoalValue), outlook.availableMinutes, outlook.neededMinutes)}
            </p>
            {outlook.status !== "ok" && (
              <div className="mt-2 flex flex-wrap gap-2">
                {outlook.neededPerDay !== null && (
                  <button
                    type="button"
                    data-testid="outlook-more-time"
                    onClick={() => setGoal({ ...goal, dailyGoalType: "minutes", dailyGoalValue: Math.ceil(outlook.neededPerDay! * 1.2) })}
                    className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-surface"
                  >
                    {fill(c_studyGoalPanel(de).planWith0MinDay, Math.ceil(outlook.neededPerDay * 1.2))}
                  </button>
                )}
                {outlook.suggestedExamDate && (
                  <button
                    type="button"
                    data-testid="outlook-shift-date"
                    onClick={() => setGoal({ ...goal, examDate: outlook.suggestedExamDate })}
                    className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-surface"
                  >
                    {de ? `Termin auf ${new Date(outlook.suggestedExamDate).toLocaleDateString("de-DE")} schieben` : `Move the date to ${new Date(outlook.suggestedExamDate).toLocaleDateString("en-US")}`}
                  </button>
                )}
              </div>
            )}
            <p className="mt-2 text-faint">{c_studyGoalPanel(de).thisIsARoughEstimate}</p>
          </div>
        );
      })()}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {c_studyGoalPanel(locale).saveStudyGoal}
        </button>
        {savedNote && (
          <span className="flex items-center gap-1 text-xs text-success-text">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {savedNote}
          </span>
        )}
        {error && <span className="text-xs text-danger-text">{error}</span>}
      </div>
    </div>
  );
}
