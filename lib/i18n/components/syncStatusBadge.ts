// Texte von components/SyncStatusBadge.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    never: "nie",
    online: "Online",
    offline: "Offline",
    pending: "Ausstehend",
    signInNeededSignIn: "Anmeldung nötig: melde dich an, dann werden die Ergebnisse übertragen.",
    failedWillRetry: "Fehlgeschlagen (wird erneut versucht)",
    sessionWasAlreadyCompletedYour: "Session war schon abgeschlossen, deine Antworten wurden trotzdem gezählt.",
    view: "Ansehen",
    discard: "Verwerfen",
    conflicts: "Konflikte",
    lastSynced: "Zuletzt synchronisiert",
    syncNow: "Jetzt synchronisieren",
    n0AnswerSWereFor: "{0} Antwort(en) betrafen Fragen, die es nicht mehr gibt, und wurden übersprungen.",
    n0ResultsCouldNotBe: "{0} Ergebnisse konnten nicht zugeordnet werden",
    // Name des Badge-Knopfs für Screenreader: „Sync-Status: Offline, 3 ausstehend“.
    buttonLabel: "Sync-Status",
    syncing: "Synchronisierung läuft",
    n0Pending: "{0} ausstehend",
    notice: "Hinweis",
  },
  en: {
    never: "never",
    online: "Online",
    offline: "Offline",
    pending: "Pending",
    signInNeededSignIn: "Sign-in needed: sign in and your results will be uploaded.",
    failedWillRetry: "Failed (will retry)",
    sessionWasAlreadyCompletedYour: "Session was already completed, your answers were counted anyway.",
    view: "View",
    discard: "Discard",
    conflicts: "Conflicts",
    lastSynced: "Last synced",
    syncNow: "Sync now",
    n0AnswerSWereFor: "{0} answer(s) were for questions that no longer exist and were skipped.",
    n0ResultsCouldNotBe: "{0} results could not be matched",
    buttonLabel: "Sync status",
    syncing: "Syncing",
    n0Pending: "{0} pending",
    notice: "Notice",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_syncStatusBadge(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
