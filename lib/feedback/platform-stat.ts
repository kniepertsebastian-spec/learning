/**
 * Plattformstatistik in Rückmeldungen (roadmap_motivation Phase 8): nur mit echter Datenbasis, sonst keine Zahl.
 * Die Zahl kommt ausschließlich aus echten Antworten; unterhalb der Schwelle gibt es gar keinen Satz.
 */
export const PLATFORM_STAT_MIN_ANSWERS = 50;

export interface FirstTryStats {
  /** Erste Antworten verschiedener Lernender auf die Frage oder ihre Varianten. */
  answers: number;
  /** Davon nicht gleich beim ersten Mal gelöst. */
  notSolved: number;
}

/** „x von 10“ gerundet; nur wenn die Schwelle erreicht ist und die Zahl etwas aussagt (nicht 0 und nicht 10 von 10). */
export function platformStatText(stats: FirstTryStats | null, locale: "de" | "en"): string | null {
  if (!stats || stats.answers < PLATFORM_STAT_MIN_ANSWERS || stats.notSolved < 0 || stats.notSolved > stats.answers) return null;
  const tenths = Math.round((stats.notSolved / stats.answers) * 10);
  if (tenths < 1 || tenths > 9) return null;
  return locale === "de"
    ? `${tenths} von 10 Lernenden lösen das nicht gleich beim ersten Mal. Damit bist du in guter Gesellschaft.`
    : `${tenths} in 10 learners don't get this on the first try. You're in good company.`;
}
