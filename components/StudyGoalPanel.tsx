"use client";

import { useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, Target } from "lucide-react";
import type { Locale } from "@/lib/types";

export interface StudyGoalState {
  examDate: string | null;
  dailyGoalType: "minutes" | "questions";
  dailyGoalValue: number;
  activeDays: number[];
  preferredLocale: "de" | "en" | null;
}

const DEFAULT_GOAL: StudyGoalState = {
  examDate: null,
  dailyGoalType: "minutes",
  dailyGoalValue: 15,
  activeDays: [1, 2, 3, 4, 5, 6, 7],
  preferredLocale: null,
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
}: {
  certId: string;
  locale: Locale;
  initialGoal: StudyGoalState | null;
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
      setSavedNote(locale === "de" ? "Lernziel gespeichert." : "Study goal saved.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : locale === "de" ? "Speichern fehlgeschlagen." : "Save failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium">
        <Target className="h-4 w-4" aria-hidden="true" />
        {locale === "de" ? "Lernziel" : "Study goal"}
      </h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs">
          <span className="mb-1 flex items-center gap-1 font-medium text-foreground/70">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {locale === "de" ? "Prüfungstermin (optional)" : "Exam date (optional)"}
          </span>
          <input
            type="date"
            value={goal.examDate ?? ""}
            onChange={(e) => setGoal({ ...goal, examDate: e.target.value || null })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-foreground/70">
            {locale === "de" ? "Tagesziel" : "Daily goal"}
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
              <option value="minutes">{locale === "de" ? "Minuten/Tag" : "minutes/day"}</option>
              <option value="questions">{locale === "de" ? "Fragen/Tag" : "questions/day"}</option>
            </select>
          </div>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-foreground/70">
            {locale === "de" ? "Bevorzugte Inhaltssprache" : "Preferred content language"}
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
            <option value="">{locale === "de" ? "Keine Präferenz" : "No preference"}</option>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-xs font-medium text-foreground/70">
          {locale === "de" ? "Aktive Lerntage" : "Active study days"}
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
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-foreground/60 hover:bg-background"
                }`}
              >
                {locale === "de" ? de : en}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {locale === "de" ? "Lernziel speichern" : "Save study goal"}
        </button>
        {savedNote && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {savedNote}
          </span>
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}
