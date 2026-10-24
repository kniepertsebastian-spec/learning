"use client";

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
        <label htmlFor="weekly-goal" className="text-sm font-medium">{de ? "Wochenziel (Lerntage pro Woche)" : "Weekly goal (study days per week)"}</label>
        <p className="text-xs text-subtle">{de ? "Leichte Tage aus deinem Lernplan zählen nicht gegen das Ziel." : "Light days from your study plan do not count against the goal."}</p>
        <select id="weekly-goal" value={prefs.weeklyGoalDays} onChange={(e) => void update({ weeklyGoalDays: Number(e.target.value) })} className="mt-2 rounded-md border border-border bg-surface px-2 py-1 text-sm" data-testid="weekly-goal">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      {toggle("pref-streak", de ? "Serie anzeigen" : "Show streak", de ? "Aufeinanderfolgende Lerntage, mit einem freien Tag pro Woche und ohne leichte Tage. Aus, wenn dich Serien eher unter Druck setzen." : "Consecutive study days, with one free day per week and without light days. Off if streaks put you under pressure.", prefs.showStreak, (v) => void update({ showStreak: v }))}
      {toggle("pref-confidence", de ? "Sicherheitsangabe bei Fragen" : "Confidence rating on questions", de ? "Ab der 3. Session: „Wie sicher bist du?“ Damit wir Geratenes öfter wiederholen." : "From the 3rd session: “How sure are you?” So we repeat guesses more often.", prefs.askConfidence, (v) => void update({ askConfidence: v }))}
      {toggle("pref-checkin", de ? "Check-in zur Tagesform" : "Daily check-in", de ? "Ab der 5. Session: Energie und Arbeitstag vor dem Start. Die Planung passt sich damit an deinen Tag an." : "From the 5th session: energy and workday before you start. Planning adapts to your day.", prefs.offerCheckin, (v) => void update({ offerCheckin: v }))}
      {toggle("pref-feedback", de ? "Sofort-Feedback nach jeder Frage" : "Instant feedback after each question", de ? "Aus: Richtig und Falsch erst am Ende, wie in der Prüfung (gilt für dieses Gerät)." : "Off: right and wrong only at the end, like in the exam (this device only).", feedbackMode === "instant", (v) => setFeedbackMode(v ? "instant" : "end"))}
      {toggle("pref-think-first", de ? "Antwort zuerst überlegen" : "Think of the answer first", de ? "Bei Auswahlfragen bleiben die Optionen verdeckt, bis du „Optionen zeigen“ wählst. Eine Lernhilfe ohne Einfluss auf dein Rating (gilt für dieses Gerät)." : "On multiple-choice questions the options stay hidden until you choose “Show options”. A study aid with no effect on your rating (this device only).", thinkFirst, setThinkFirst)}
      <p className="mt-2 text-xs text-subtle" role="status" data-testid="prefs-status">
        {status === "saving" ? (de ? "Speichert …" : "Saving …") : status === "saved" ? (de ? "Gespeichert." : "Saved.") : status === "error" ? (de ? "Das hat nicht geklappt." : "That did not work.") : ""}
      </p>
    </Card>
  );
}
