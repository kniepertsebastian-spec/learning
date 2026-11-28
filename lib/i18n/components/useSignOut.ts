// Texte von lib/client/use-sign-out.ts (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` in den Code.
const texts = {
  de: {
    // Die Ergebnisse gehen NICHT verloren: clearLocalUserData löscht nur das Kurspaket, die Sync-Warteschlange bleibt auf dem Gerät.
    unsyncedOne: "1 Lernergebnis ist noch nicht übertragen. Es bleibt auf diesem Gerät gespeichert und wird bei deiner nächsten Anmeldung übertragen. Jetzt abmelden?",
    unsyncedMany: "{0} Lernergebnisse sind noch nicht übertragen. Sie bleiben auf diesem Gerät gespeichert und werden bei deiner nächsten Anmeldung übertragen. Jetzt abmelden?",
    unsyncedTitle: "Noch nicht übertragen",
    signOutAnyway: "Abmelden",
  },
  en: {
    unsyncedOne: "1 study result has not been synced yet. It stays saved on this device and is synced the next time you sign in. Sign out now?",
    unsyncedMany: "{0} study results have not been synced yet. They stay saved on this device and are synced the next time you sign in. Sign out now?",
    unsyncedTitle: "Not synced yet",
    signOutAnyway: "Sign out",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_useSignOut(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
