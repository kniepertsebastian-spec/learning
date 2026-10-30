// Texte von components/ActivityTrends.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    trendActivity: "Trend & Aktivität",
    dayStreak: "Tage in Folge",
    exportJson: "Export (JSON)",
    days: "Tage",
    activeDays: "aktive Tage",
    activitYIes: "Aktivität(en)",
  },
  en: {
    trendActivity: "Trend & activity",
    dayStreak: "day streak",
    exportJson: "Export (JSON)",
    days: "days",
    activeDays: "active days",
    activitYIes: "activit(y/ies)",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_activityTrends(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
