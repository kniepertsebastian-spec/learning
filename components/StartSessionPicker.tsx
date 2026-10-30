"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import type { Locale } from "@/lib/types";
import { alternativeHref, ENERGY_ALTERNATIVES, offerEnergyAlternatives, type EnergyAlternative } from "@/lib/study/energy-modes";

const TIME_BUDGETS = [2, 5, 10, 20];
/** Grenzen der freien Eingabe; die API erlaubt 1-180 Minuten (startSessionSchema). */
const CUSTOM_MIN = 1;
const CUSTOM_MAX = 180;

/**
 * R2 (roadmap.md, neue Fassung): "Nutzer wählt 2, 5, 10 oder 20 Minuten" -
 * primäre Session-Eingabe, bewusst VOR dem Session-Bau gezeigt (nicht nur
 * als Tagesziel-Einstellung, siehe startStudySession() in
 * session-service.ts). Erscheint auf der Kursseite anstelle von
 * TodayDashboard, solange noch keine gültige Session für heute existiert.
 * Der "Nur eine Aufgabe"-Modus braucht keine eigene Session-Builder-Logik:
 * goalType "questions" mit goalValue 1 reicht bereits, das rechnet
 * estimateTargetQuestionCount() direkt auf eine Zielgröße von 1 um.
 *
 * "Optionaler Energiezustand" (dieselbe Roadmap-Liste): rein lokaler
 * Auswahlzustand, keine eigene Bestätigung nötig - ein Klick auf einen der
 * Zeitbudget-Buttons sendet die zuletzt gewählte Energie einfach mit, ohne
 * Auswahl bleibt sie unberücksichtigt (Abnahmekriterium "Innerhalb von zwei
 * Interaktionen startet eine sinnvolle Mission" bleibt damit erfüllt).
 */
export function StartSessionPicker({
  certSlug,
  certificationId,
  locale,
  intro = { firstSession: false, offerCheckin: true },
  welcomeBack = false,
  energyModes = false,
  deescalated = false,
}: {
  certSlug: string;
  certificationId: string;
  locale: Locale;
  /** Schrittweise Einführung: erste Session nur „Starten“, Check-in erst ab der 5. Session (und wenn nicht abgeschaltet). */
  intro?: { firstSession: boolean; offerCheckin: boolean };
  /** Nach längerer Pause: „Willkommen zurück – heute nur 5 Minuten“. */
  welcomeBack?: boolean;
  /** Flag `energy_modes`: bei niedriger Energie oder in der Entlastung Alternativen anbieten (nie Zwang). */
  energyModes?: boolean;
  deescalated?: boolean;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [workday, setWorkday] = useState<boolean | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");
  const customValue = Number(customMinutes);
  const customValid = Number.isInteger(customValue) && customValue >= CUSTOM_MIN && customValue <= CUSTOM_MAX;

  const showAlternatives = offerEnergyAlternatives({ enabled: energyModes, energy, deescalated });

  /** Wahl festhalten (nur wenn die Alternativen angeboten wurden); ein Fehler hier blockiert nie den Start. */
  function logChoice(mode: "normal" | EnergyAlternative) {
    if (!showAlternatives) return;
    void fetch("/api/energy-mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ certificationId, mode, energy, deescalated }), keepalive: true }).catch(() => {});
  }

  async function handleStart(key: string, goalType: "minutes" | "questions", goalValue: number, mode?: "reviews_only") {
    if (starting !== null) return;
    setStarting(key);
    setError(null);
    try {
      const response = await fetch("/api/study-sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificationId, goalValue, goalType, mode, checkin: { energyLevel: energy ?? undefined, hadWorkday: workday ?? undefined } }),
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

  const de = locale === "de";
  // Erste Session: nur „Starten“ (Standard 10 Minuten), ohne Check-in und weitere Eingaben.
  if (intro.firstSession) {
    return (
      <div className="hero-surface rounded-2xl border p-5" data-testid="start-first-session">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Sparkles className="h-4 w-4 text-link" aria-hidden="true" />
          {de ? "Los geht's" : "Let's go"}
        </h2>
        <p className="mb-3 text-xs text-subtle">{de ? "Zehn Minuten reichen für den Anfang: etwa zwölf Fragen, jede dauert rund eine Dreiviertelminute. Das ist kein Einstiegstest (den gibt es je Kapitel separat und optional). Mit „Pause für heute“ machst du später weiter." : "Ten minutes are enough to start: about twelve questions, each taking roughly 45 seconds. This is not an entry test (those are separate per chapter and optional). Use “Pause for today” to continue later."}</p>
        <button
          type="button"
          onClick={() => void handleStart("first", "minutes", 10)}
          disabled={starting !== null}
          data-testid="start-first"
          className="flex items-center gap-1.5 h-11 rounded-md bg-primary px-5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {starting === "first" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {de ? "Starten (10 Minuten)" : "Start (10 minutes)"}
        </button>
        {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
      </div>
    );
  }

  return (
    <div className="hero-surface rounded-2xl border p-5">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Sparkles className="h-4 w-4 text-link" aria-hidden="true" />
        {welcomeBack ? (de ? "Willkommen zurück – heute nur 5 Minuten" : "Welcome back – just 5 minutes today") : de ? "Wie viel Zeit hast du gerade?" : "How much time do you have?"}
      </h2>
      {welcomeBack && (
        <p className="mb-3 text-xs text-subtle" data-testid="welcome-back">
          {de ? "Wiederholungen werden über die nächsten Tage verteilt, es wartet kein Berg auf dich." : "Reviews are spread over the next days, there is no mountain waiting for you."}
        </p>
      )}
      <p className="mb-3 text-xs text-subtle" data-testid="session-length-hint">
        {de ? "Etwa 45 Sekunden pro Frage. Das ist die Tages-Session, kein Einstiegstest, und du kannst sie jederzeit pausieren." : "About 45 seconds per question. This is the daily session, not an entry test, and you can pause it any time."}
      </p>
      <div className="flex flex-wrap gap-2">
        {TIME_BUDGETS.map((minutes) => {
          const key = `minutes-${minutes}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { logChoice("normal"); void handleStart(key, "minutes", minutes); }}
              disabled={starting !== null}
              className={`flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:border-accent hover:bg-background disabled:cursor-not-allowed disabled:opacity-60 ${
                welcomeBack && minutes === 5 ? "border-accent bg-accent-soft text-link" : "border-border bg-surface"
              }`}
            >
              {starting === key && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {minutes} {locale === "de" ? "Min." : "min"}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => { logChoice("single_task"); void handleStart("single", "questions", 1); }}
          disabled={starting !== null}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-border bg-surface px-4 py-2 text-sm font-medium hover:border-accent hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {starting === "single" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Zap className="h-3.5 w-3.5 text-link" aria-hidden="true" />
          )}
          {locale === "de" ? "Nur eine Aufgabe" : "Just one task"}
        </button>
        <button
          type="button"
          onClick={() => setCustomOpen((open) => !open)}
          disabled={starting !== null}
          aria-expanded={customOpen}
          data-testid="custom-time-toggle"
          className="flex items-center gap-1.5 rounded-md border border-dashed border-border bg-surface px-4 py-2 text-sm font-medium hover:border-accent hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {de ? "Eigene Zeit" : "Custom"}
        </button>
      </div>
      {customOpen && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!customValid) return;
            logChoice("normal");
            void handleStart("custom", "minutes", customValue);
          }}
        >
          <label className="text-xs text-subtle" htmlFor="custom-minutes">
            {de ? `Minuten (${CUSTOM_MIN}–${CUSTOM_MAX})` : `Minutes (${CUSTOM_MIN}–${CUSTOM_MAX})`}
          </label>
          <input
            id="custom-minutes"
            type="number"
            inputMode="numeric"
            min={CUSTOM_MIN}
            max={CUSTOM_MAX}
            step={1}
            value={customMinutes}
            onChange={(event) => setCustomMinutes(event.target.value)}
            placeholder="50"
            autoFocus
            disabled={starting !== null}
            data-testid="custom-minutes-input"
            className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={starting !== null || !customValid}
            data-testid="custom-start"
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {starting === "custom" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {de ? "Starten" : "Start"}
          </button>
        </form>
      )}

      {intro.offerCheckin && (
        <>
      <p className="mb-1.5 mt-3 text-xs text-faint">
        {locale === "de" ? "Check-in (optional): Wie viel Energie hast du?" : "Check-in (optional): how much energy do you have?"}
      </p>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={locale === "de" ? "Energie von 1 bis 5" : "Energy from 1 to 5"}>
        {[1, 2, 3, 4, 5].map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setEnergy((current) => (current === level ? null : level))}
            disabled={starting !== null}
            aria-pressed={energy === level}
            title={level === 1 ? (locale === "de" ? "Erschöpft" : "Exhausted") : level === 5 ? (locale === "de" ? "Voller Energie" : "Full of energy") : String(level)}
            className={`h-7 w-7 rounded-md border text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
              energy === level
                ? "border-accent bg-accent-soft text-link"
                : "border-border bg-surface text-subtle hover:border-accent-border"
            }`}
          >
            {level}
          </button>
        ))}
      </div>
      <p className="mb-1.5 mt-3 text-xs text-faint">
        {locale === "de" ? "Heute gearbeitet? (optional)" : "Worked today? (optional)"}
      </p>
      <div className="flex gap-1.5">
        {([true, false] as const).map((value) => (
          <button
            key={String(value)}
            type="button"
            onClick={() => setWorkday((current) => (current === value ? null : value))}
            disabled={starting !== null}
            aria-pressed={workday === value}
            className={`rounded-md border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
              workday === value
                ? "border-accent bg-accent-soft text-link"
                : "border-border bg-surface text-subtle hover:border-accent-border"
            }`}
          >
            {value ? (locale === "de" ? "Ja" : "Yes") : locale === "de" ? "Nein" : "No"}
          </button>
        ))}
      </div>

        </>
      )}
      <p className="mt-3 text-xs text-faint">
        <a href="/how-i-learn" className="text-link hover:underline" data-testid="how-i-learn-link">{de ? "Wie ich lerne" : "How I learn"}</a>
      </p>

      {showAlternatives && (
        <div className="mt-4 rounded-md border border-border bg-surface p-3" data-testid="energy-alternatives">
          <p className="text-sm font-medium">{de ? "Wenig Energie? Du kannst heute auch anders lernen:" : "Low on energy? You can also learn differently today:"}</p>
          <p className="mb-2 text-xs text-subtle">{de ? "Alles optional. Die normale Session bleibt oben jederzeit wählbar." : "All optional. The normal session stays available above."}</p>
          <div className="flex flex-wrap gap-2">
            {ENERGY_ALTERNATIVES.map((mode) => {
              const href = alternativeHref(mode, certSlug);
              const label = { simulation: de ? "Kurze Simulation (5 Min.)" : "Short simulation (5 min)", cheat_sheet: de ? "Spickzettel durchgehen" : "Browse cheat sheets", reviews_only: de ? "Nur Wiederholungen" : "Reviews only", single_task: de ? "Nur eine Aufgabe" : "Just one task" }[mode];
              const cls = "rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:border-accent";
              return href ? (
                <Link key={mode} href={href} onClick={() => logChoice(mode)} className={cls} data-testid={`energy-${mode}`}>
                  {label}
                </Link>
              ) : (
                <button
                  key={mode}
                  type="button"
                  disabled={starting !== null}
                  onClick={() => {
                    logChoice(mode);
                    void (mode === "single_task" ? handleStart("single", "questions", 1) : handleStart(mode, "minutes", 10, "reviews_only"));
                  }}
                  className={`${cls} disabled:cursor-not-allowed disabled:opacity-60`}
                  data-testid={`energy-${mode}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
    </div>
  );
}
