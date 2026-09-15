"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Zap } from "lucide-react";
import type { Locale } from "@/lib/types";

const TIME_BUDGETS = [2, 5, 10, 20];

/**
 * R2 (roadmap.md, neue Fassung): "Nutzer wählt 2, 5, 10 oder 20 Minuten" -
 * primäre Session-Eingabe, bewusst VOR dem Session-Bau gezeigt (nicht nur
 * als Tagesziel-Einstellung, siehe startStudySession() in
 * session-service.ts). Erscheint auf der Kursseite anstelle von
 * TodayDashboard, solange noch keine gültige Session für heute existiert.
 * Der "Nur eine Aufgabe"-Modus braucht keine eigene Session-Builder-Logik:
 * goalType "questions" mit goalValue 1 reicht bereits, das rechnet
 * estimateTargetQuestionCount() direkt auf eine Zielgröße von 1 um.
 */
export function StartSessionPicker({
  certSlug,
  certificationId,
  locale,
}: {
  certSlug: string;
  certificationId: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleStart(key: string, goalType: "minutes" | "questions", goalValue: number) {
    if (starting !== null) return;
    setStarting(key);
    setError(null);
    try {
      const response = await fetch("/api/study-sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificationId, goalValue, goalType }),
      });
      if (!response.ok && response.status !== 409) {
        throw new Error(`Status ${response.status}`);
      }
      router.push(`/cert/${certSlug}/session`);
    } catch {
      setError(locale === "de" ? "Session konnte nicht gestartet werden." : "Could not start session.");
      setStarting(null);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-accent/30 bg-accent/5 p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
        {locale === "de" ? "Wie viel Zeit hast du gerade?" : "How much time do you have?"}
      </h2>
      <div className="flex flex-wrap gap-2">
        {TIME_BUDGETS.map((minutes) => {
          const key = `minutes-${minutes}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => void handleStart(key, "minutes", minutes)}
              disabled={starting !== null}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:border-accent hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
            >
              {starting === key && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {minutes} {locale === "de" ? "Min." : "min"}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => void handleStart("single", "questions", 1)}
          disabled={starting !== null}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-border bg-surface px-4 py-2 text-sm font-medium hover:border-accent hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {starting === "single" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Zap className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          )}
          {locale === "de" ? "Nur eine Aufgabe" : "Just one task"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
