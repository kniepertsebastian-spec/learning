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
    appTitle: "ProofPath",
    statusBadge: "Beta",
    nav: {
      dashboard: "Dashboard",
    },
    quiz: {
      close: "Schließen",
      leaveTitle: "Sitzung verlassen?",
      leaveBody: "Deine bisherigen Antworten in dieser Sitzung gehen verloren.",
      leave: "Verlassen",
      stay: "Weitermachen",
      practiceMode: "Übungsmodus",
      examMode: "Prüfungsmodus",
      questionXofY: "Frage {x} von {y}",
      correctWrong: "{a} richtig · {b} falsch",
      answeredXofY: "{x} von {y} beantwortet",
      flag: "Markieren",
      flagged: "Markiert",
      difficultyBeginner: "Einsteiger",
      difficultyIntermediate: "Fortgeschritten",
      difficultyAdvanced: "Experte",
      options: "Antwortoptionen",
      confidenceTitle: "Wie sicher bist du?",
      confidenceHint: "Fließt in deine Wiederholungsplanung ein.",
      guessed: "Geraten",
      unsure: "Unsicher",
      sure: "Sicher",
      correct: "Richtig",
      notQuite: "Nicht ganz – richtig ist {letter}",
      yourConfidence: "Selbsteinschätzung: {c}",
      whyNot: "Warum die anderen nicht passen",
      source: "Quelle",
      report: "Frage melden",
      reportAsk: "Was stimmt nicht?",
      reportThanks: "Danke, diese Frage wurde gemeldet.",
      reasonIncorrect: "Falsch",
      reasonUnclear: "Unklar",
      reasonOutdated: "Veraltet",
      next: "Nächste Frage",
      previous: "Zurück",
      nextShort: "Weiter",
      finish: "Abschließen",
      submitExam: "Prüfung abgeben",
      submitting: "Wird ausgewertet …",
      hotkeys: "A–D oder 1–4 wählen · Enter weiter · F markieren · Esc schließen",
      hotkeysExam: "A–D oder 1–4 wählen · Enter weiter · F markieren · Esc schließen",
      navigator: "Fragenübersicht",
      legendOpen: "Offen",
      legendAnswered: "Beantwortet",
      legendCorrect: "Richtig",
      legendWrong: "Falsch",
      legendFlagged: "Markiert",
      legendCurrent: "Aktuell",
      examNoFeedback: "Im Prüfungsmodus gibt es kein Sofort-Feedback – die Auswertung kommt erst am Ende.",
      timeLeft: "Verbleibende Zeit",
      resultTitle: "Ergebnis",
      passMark: "Bestehensgrenze {n} %",
      outOf: "von 100",
      byDomain: "Nach Domain",
      strong: "stark",
      weak: "schwach",
      weakAreas: "Schwache Bereiche",
      recommendations: "Empfehlungen",
      reviewWrong: "Falsche Antworten durchgehen",
      practiceTargeted: "Gezielt üben",
      backToCourse: "Zurück zum Kurs",
      correctCount: "{a} von {b} richtig",
      offlineNote: "Offline-Modus: Dieses Ergebnis wird synchronisiert, sobald du wieder online bist.",
      confidenceLabel: "Konfidenz",
      lessonsRecommended: "Empfohlene Lektionen",
      nothingToday: "Für heute gibt es nichts zu lernen – schau später wieder vorbei.",
      categoryReview: "Wiederholung",
      categoryWeak: "Schwacher Bereich",
      categoryNew: "Neu",
      sectionQuiz: "Kurz-Check",
      remediation: "Gezielt üben",
      session: "Heutige Sitzung",
    },
    shell: {
      context: "Kontext",
      contextPersonal: "Persönlich",
      contextCompany: "Firma",
      contextAdmin: "Plattform-Admin",
      switchContext: "Kontext wechseln",
      areas: "Bereiche",
      navLabel: "Hauptnavigation",
      openMenu: "Menü öffnen",
      closeMenu: "Menü schließen",
      learn: "Lernen",
      profile: "Mein Profil",
      account: "Konto & Daten",
      companyResults: "Ergebnisse",
      companyMandatory: "Pflichtschulung",
      companyPaths: "Interne Learnings",
      companyWork: "Aufgaben & Module",
      companyOnboarding: "Onboarding",
      companyDocuments: "Dokumente",
      companyTeam: "Team",
      companySignIn: "Anmeldung",
      adminOverview: "Übersicht",
      adminRequests: "Kursanfragen",
      adminUi: "Komponenten",
      search: "Suchen …",
      searchLabel: "Suche",
      streak: "Tage Serie",
      userMenu: "Benutzermenü",
      userMenuHint: "Konto, Sprache, Theme",
      language: "Sprache",
      theme: "Darstellung",
      themeDark: "Dunkel",
      themeLight: "Hell",
      signOut: "Abmelden",
      skipToContent: "Zum Inhalt springen",
      adminStrip: "PLATTFORM-ADMIN",
      adminStripText: "Änderungen wirken für alle Kunden und Lernenden.",
      adminStripLink: "Zur Lernansicht",
      signIn: "Anmelden",
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
      loading: "Claude erstellt deinen Lehrplan …",
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
      generating: "Claude erstellt den Lerninhalt …",
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
      generating: "Claude erstellt die Probeprüfung …",
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
    appTitle: "ProofPath",
    statusBadge: "Beta",
    nav: {
      dashboard: "Dashboard",
    },
    quiz: {
      close: "Close",
      leaveTitle: "Leave this session?",
      leaveBody: "Your answers in this session will be lost.",
      leave: "Leave",
      stay: "Keep going",
      practiceMode: "Practice mode",
      examMode: "Exam mode",
      questionXofY: "Question {x} of {y}",
      correctWrong: "{a} correct · {b} wrong",
      answeredXofY: "{x} of {y} answered",
      flag: "Flag",
      flagged: "Flagged",
      difficultyBeginner: "Beginner",
      difficultyIntermediate: "Intermediate",
      difficultyAdvanced: "Advanced",
      options: "Answer options",
      confidenceTitle: "How sure are you?",
      confidenceHint: "Feeds into your review planning.",
      guessed: "Guessed",
      unsure: "Unsure",
      sure: "Sure",
      correct: "Correct",
      notQuite: "Not quite – the answer is {letter}",
      yourConfidence: "Your confidence: {c}",
      whyNot: "Why the others don't fit",
      source: "Source",
      report: "Report question",
      reportAsk: "What's wrong?",
      reportThanks: "Thanks, this question was reported.",
      reasonIncorrect: "Incorrect",
      reasonUnclear: "Unclear",
      reasonOutdated: "Outdated",
      next: "Next question",
      previous: "Previous",
      nextShort: "Next",
      finish: "Finish",
      submitExam: "Submit exam",
      submitting: "Evaluating …",
      hotkeys: "A–D or 1–4 select · Enter next · F flag · Esc close",
      hotkeysExam: "A–D or 1–4 select · Enter next · F flag · Esc close",
      navigator: "Question overview",
      legendOpen: "Open",
      legendAnswered: "Answered",
      legendCorrect: "Correct",
      legendWrong: "Wrong",
      legendFlagged: "Flagged",
      legendCurrent: "Current",
      examNoFeedback: "Exam mode gives no instant feedback – results come at the end.",
      timeLeft: "Time left",
      resultTitle: "Result",
      passMark: "Pass mark {n} %",
      outOf: "of 100",
      byDomain: "By domain",
      strong: "strong",
      weak: "weak",
      weakAreas: "Weak areas",
      recommendations: "Recommendations",
      reviewWrong: "Review wrong answers",
      practiceTargeted: "Practice targeted",
      backToCourse: "Back to course",
      correctCount: "{a} of {b} correct",
      offlineNote: "Offline mode: this result will sync once you're back online.",
      confidenceLabel: "Confidence",
      lessonsRecommended: "Recommended lessons",
      nothingToday: "Nothing to study right now – check back later.",
      categoryReview: "Review",
      categoryWeak: "Weak area",
      categoryNew: "New",
      sectionQuiz: "Quick check",
      remediation: "Targeted practice",
      session: "Today's session",
    },
    shell: {
      context: "Context",
      contextPersonal: "Personal",
      contextCompany: "Company",
      contextAdmin: "Platform admin",
      switchContext: "Switch context",
      areas: "Areas",
      navLabel: "Main navigation",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      learn: "Learn",
      profile: "My profile",
      account: "Account & data",
      companyResults: "Results",
      companyMandatory: "Mandatory training",
      companyPaths: "Internal learning",
      companyWork: "Tasks & modules",
      companyOnboarding: "Onboarding",
      companyDocuments: "Documents",
      companyTeam: "Team",
      companySignIn: "Sign-in",
      adminOverview: "Overview",
      adminRequests: "Course requests",
      adminUi: "Components",
      search: "Search …",
      searchLabel: "Search",
      streak: "day streak",
      userMenu: "User menu",
      userMenuHint: "Account, language, theme",
      language: "Language",
      theme: "Appearance",
      themeDark: "Dark",
      themeLight: "Light",
      signOut: "Sign out",
      skipToContent: "Skip to content",
      adminStrip: "PLATFORM ADMIN",
      adminStripText: "Changes affect all customers and learners.",
      adminStripLink: "Back to learning",
      signIn: "Sign in",
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
      loading: "Claude is generating your study plan …",
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
      generating: "Claude is generating the lesson content …",
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
      generating: "Claude is generating the mock exam …",
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
