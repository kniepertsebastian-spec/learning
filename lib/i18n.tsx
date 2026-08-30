"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Locale } from "./types";

const STORAGE_KEY = "certstudy-locale";

let listeners: Array<() => void> = [];
let currentLocale: Locale | null = null;

function computeInitialLocale(): Locale {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "de" || stored === "en") return stored;
  return window.navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

function getSnapshot(): Locale {
  if (currentLocale === null) {
    currentLocale = computeInitialLocale();
  }
  return currentLocale;
}

function getServerSnapshot(): Locale {
  return "de";
}

function subscribe(callback: () => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

function persistLocale(next: Locale) {
  currentLocale = next;
  window.localStorage.setItem(STORAGE_KEY, next);
  document.cookie = `certstudy-locale=${next}; path=/; max-age=31536000; SameSite=Lax`;
  for (const listener of listeners) listener();
}

export const uiStrings = {
  de: {
    appTitle: "CertStudy AI",
    statusBadge: "Beta",
    nav: {
      dashboard: "Dashboard",
    },
    dashboard: {
      heading: "Deine Zertifikate",
      addCertificate: "+ Neues Zertifikat hinzufügen",
      emptyTitle: "Noch kein Zertifikat angelegt",
      emptyBody:
        "Lege dein erstes Zertifikat an und lass dir von der KI einen individuellen Lehrplan erstellen.",
      progress: "Fortschritt",
      nextLesson: "Nächste Lektion",
      day: "Tag",
      of: "von",
      continue: "Fortsetzen",
      allDone: "Alle Module abgeschlossen",
    },
    addCertModal: {
      title: "Zertifikat anlegen",
      certNameLabel: "Zertifikatsname",
      certNamePlaceholder: "z. B. CompTIA Security+ SY0-701",
      totalDaysLabel: "Zieldauer in Tagen",
      cancel: "Abbrechen",
      submit: "Lehrplan generieren",
      loading: "Gemini erstellt deinen Lehrplan …",
      error: "Der Lehrplan konnte nicht erstellt werden.",
    },
    generation: {
      signInRequired: "Bitte melde dich an, um KI-Inhalte zu generieren.",
      signInLink: "Anmelden",
    },
    certDetail: {
      back: "Zurück zum Dashboard",
      roadmap: "Roadmap",
      dayLabel: "Tag",
      statusCompleted: "Abgeschlossen",
      statusActive: "Aktiv",
      statusLocked: "Gesperrt",
      continueToday: "Heutige Lektion fortsetzen",
      startExam: "Simulierte Probeprüfung starten",
      notFound: "Zertifikat nicht gefunden.",
    },
    lesson: {
      markRead: "Lektion als gelesen markieren",
      quizTitle: "Tagesquiz",
      submitAnswer: "Antwort prüfen",
      nextQuestion: "Nächste Frage",
      finishQuiz: "Quiz abschließen",
      correct: "Richtig!",
      incorrect: "Leider falsch.",
      quizComplete: "Quiz abgeschlossen",
      score: "Ergebnis",
      backToCert: "Zurück zum Zertifikat",
      generating: "Gemini erstellt den Lerninhalt …",
      loadError: "Der Lerninhalt konnte nicht erstellt werden.",
    },
    exam: {
      title: "Probeprüfung",
      start: "Prüfung starten",
      questionCountLabel: "Anzahl Fragen",
      timeLeft: "Verbleibende Zeit",
      question: "Frage",
      flagged: "Markiert",
      unanswered: "Unbeantwortet",
      answered: "Beantwortet",
      flag: "Markieren",
      unflag: "Markierung entfernen",
      previous: "Zurück",
      next: "Weiter",
      submitExam: "Prüfung abgeben",
      results: "Auswertung",
      passed: "Bestanden",
      failed: "Nicht bestanden",
      yourScore: "Deine Punktzahl",
      passingScore: "Bestehensquote",
      weakAreas: "Schwachstellenanalyse",
      generating: "Gemini erstellt die Probeprüfung …",
      loadError: "Die Probeprüfung konnte nicht erstellt werden.",
      confirmSubmit: "Prüfung wirklich abgeben?",
    },
    common: {
      loading: "Lädt …",
      error: "Ein Fehler ist aufgetreten.",
      retry: "Erneut versuchen",
      close: "Schließen",
    },
  },
  en: {
    appTitle: "CertStudy AI",
    statusBadge: "Beta",
    nav: {
      dashboard: "Dashboard",
    },
    dashboard: {
      heading: "Your certificates",
      addCertificate: "+ Add new certificate",
      emptyTitle: "No certificate yet",
      emptyBody:
        "Add your first certificate and let the AI build you a personalized study plan.",
      progress: "Progress",
      nextLesson: "Next lesson",
      day: "Day",
      of: "of",
      continue: "Continue",
      allDone: "All modules completed",
    },
    addCertModal: {
      title: "Add certificate",
      certNameLabel: "Certificate name",
      certNamePlaceholder: "e.g. CompTIA Security+ SY0-701",
      totalDaysLabel: "Target duration in days",
      cancel: "Cancel",
      submit: "Generate study plan",
      loading: "Gemini is generating your study plan …",
      error: "The study plan could not be created.",
    },
    generation: {
      signInRequired: "Please sign in to generate AI content.",
      signInLink: "Sign in",
    },
    certDetail: {
      back: "Back to dashboard",
      roadmap: "Roadmap",
      dayLabel: "Day",
      statusCompleted: "Completed",
      statusActive: "Active",
      statusLocked: "Locked",
      continueToday: "Continue today's lesson",
      startExam: "Start simulated mock exam",
      notFound: "Certificate not found.",
    },
    lesson: {
      markRead: "Mark lesson as read",
      quizTitle: "Daily quiz",
      submitAnswer: "Check answer",
      nextQuestion: "Next question",
      finishQuiz: "Finish quiz",
      correct: "Correct!",
      incorrect: "Not quite.",
      quizComplete: "Quiz complete",
      score: "Score",
      backToCert: "Back to certificate",
      generating: "Gemini is generating the lesson content …",
      loadError: "The lesson content could not be created.",
    },
    exam: {
      title: "Mock exam",
      start: "Start exam",
      questionCountLabel: "Number of questions",
      timeLeft: "Time left",
      question: "Question",
      flagged: "Flagged",
      unanswered: "Unanswered",
      answered: "Answered",
      flag: "Flag",
      unflag: "Remove flag",
      previous: "Previous",
      next: "Next",
      submitExam: "Submit exam",
      results: "Results",
      passed: "Passed",
      failed: "Failed",
      yourScore: "Your score",
      passingScore: "Passing score",
      weakAreas: "Weak area analysis",
      generating: "Gemini is generating the mock exam …",
      loadError: "The mock exam could not be created.",
      confirmSubmit: "Really submit the exam?",
    },
    common: {
      loading: "Loading …",
      error: "Something went wrong.",
      retry: "Retry",
      close: "Close",
    },
  },
} as const;

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : { [K in keyof T]: Widen<T[K]> };

export type UiStrings = Widen<(typeof uiStrings)["de"]>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: UiStrings;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: uiStrings[locale] }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}
