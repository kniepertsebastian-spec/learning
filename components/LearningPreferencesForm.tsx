"use client";

import { c_learningPreferencesForm } from "@/lib/i18n/components/learningPreferencesForm";
import { useState } from "react";
import { useThinkFirst } from "@/lib/client/use-think-first";
import { useFeedbackMode } from "@/lib/client/use-feedback-mode";
import { Card } from "@/components/ui/card";

interface Prefs {
  weeklyGoalDays: number;
  showStreak: boolean;
  askConfidence: boolean;
  offerCheckin: boolean;
}

/** „Wie ich lerne“: alle Zusatz-Eingaben und Anzeige-Wünsche an einer Stelle, jederzeit änderbar. */
export function LearningPreferencesForm({ initial, locale }: { initial: Prefs; locale: "de" | "en" }) {
  const de = locale === "de";
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [feedbackMode, setFeedbackMode] = useFeedbackMode();
  const [thinkFirst, setThinkFirst] = useThinkFirst();

  async function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setStatus("saving");
    try {
      const res = await fetch("/api/learning-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  const toggle = (id: string, label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-start gap-3 py-2 text-sm" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4" data-testid={id} />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-subtle">{hint}</span>
      </span>
    </label>
  );

  return (
    <Card data-testid="learning-preferences">
      <div className="py-2">
        <label htmlFor="weekly-goal" className="text-sm font-medium">{c_learningPreferencesForm(de).weeklyGoalStudyDaysPer}</label>
        <p className="text-xs text-subtle">{c_learningPreferencesForm(de).lightDaysFromYourStudy}</p>
        <select id="weekly-goal" value={prefs.weeklyGoalDays} onChange={(e) => void update({ weeklyGoalDays: Number(e.target.value) })} className="mt-2 rounded-md border border-border bg-surface px-2 py-1 text-sm" data-testid="weekly-goal">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      {toggle("pref-streak", c_learningPreferencesForm(de).showStreak, c_learningPreferencesForm(de).consecutiveStudyDaysWithOne, prefs.showStreak, (v) => void update({ showStreak: v }))}
      {toggle("pref-confidence", c_learningPreferencesForm(de).confidenceRatingOnQuestions, c_learningPreferencesForm(de).fromThe3rdSessionHow, prefs.askConfidence, (v) => void update({ askConfidence: v }))}
      {toggle("pref-checkin", c_learningPreferencesForm(de).dailyCheckIn, c_learningPreferencesForm(de).fromThe5thSessionEnergy, prefs.offerCheckin, (v) => void update({ offerCheckin: v }))}
      {toggle("pref-feedback", c_learningPreferencesForm(de).instantFeedbackAfterEachQuestion, c_learningPreferencesForm(de).offRightAndWrongOnly, feedbackMode === "instant", (v) => setFeedbackMode(v ? "instant" : "end"))}
      {toggle("pref-think-first", c_learningPreferencesForm(de).thinkOfTheAnswerFirst, c_learningPreferencesForm(de).onMultipleChoiceQuestionsThe, thinkFirst, setThinkFirst)}
      <p className="mt-2 text-xs text-subtle" role="status" data-testid="prefs-status">
        {status === "saving" ? (c_learningPreferencesForm(de).saving) : status === "saved" ? (c_learningPreferencesForm(de).saved) : status === "error" ? (c_learningPreferencesForm(de).thatDidNotWork) : ""}
      </p>
    </Card>
  );
}
