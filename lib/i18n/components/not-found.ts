// Texte von app/not-found.tsx und app/global-error.tsx (de/en).
const texts = {
  de: {
    title: "Seite nicht gefunden",
    body: "Diese Adresse gibt es nicht (mehr). Vielleicht ein Tippfehler, oder der Inhalt wurde verschoben.",
    home: "Zur Startseite",
    catalog: "Zum Katalog",
    globalErrorTitle: "Die App konnte nicht geladen werden",
    globalErrorBody: "Beim Laden ist etwas schiefgelaufen. Dein Lernfortschritt ist nicht betroffen. Bitte versuche es gleich noch einmal.",
    globalErrorUpdating: "Eine neue Version ist da. Die App wird neu geladen …",
    retry: "Erneut versuchen",
  },
  en: {
    title: "Page not found",
    body: "This address doesn't exist (anymore). Maybe a typo, or the content has moved.",
    home: "Back to home",
    catalog: "Browse the catalog",
    globalErrorTitle: "The app could not be loaded",
    globalErrorBody: "Something went wrong while loading. Your study progress is not affected. Please try again in a moment.",
    globalErrorUpdating: "A new version is available. The app is reloading …",
    retry: "Try again",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_notFound(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
