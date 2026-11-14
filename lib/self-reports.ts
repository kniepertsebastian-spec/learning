/**
 * Freiwillige Selbstauskünfte (Aufgabe 17, Review 12.11.2026): Arten, erlaubte Werte und Regeln gegen Fragemüdigkeit. Gemeinsam
 * für Server und Client. Die einzelnen Fragen und wann sie gestellt werden, kommen mit Aufgabe 18 (Faktoren 5.1 bis 5.6).
 */

/** 5.1 Anstrengung, 5.2 Vorhersage des Behaltens, 5.3 Zuversicht für die Prüfung, 5.4 Grund, 5.5 Nutzen für die Arbeit, 5.6 Lernumgebung. */
export const SELF_REPORT_KINDS = ["effort", "retention_forecast", "exam_confidence", "learning_reason", "work_relevance", "learning_environment"] as const;
export type SelfReportKind = (typeof SELF_REPORT_KINDS)[number];

/** Worauf sich eine Antwort bezieht (Lektion, Kurs oder Lernsitzung). */
export const SELF_REPORT_REF_TYPES = ["section", "course", "session"] as const;
export type SelfReportRefType = (typeof SELF_REPORT_REF_TYPES)[number];

/** Erlaubte Werte je Art: Stufen als Zahl (als Text gespeichert) oder feste Auswahl. */
export const SELF_REPORT_VALUES: Record<SelfReportKind, readonly string[]> = {
  effort: ["1", "2", "3", "4", "5"],
  retention_forecast: ["0", "25", "50", "75", "100"],
  exam_confidence: ["0", "25", "50", "75", "100"],
  learning_reason: ["required", "job", "career_change", "interest"],
  work_relevance: ["yes", "partly", "no"],
  learning_environment: ["quiet", "on_the_go", "at_work"],
};

/** Dreimal in Folge übersprungen: die Frage pausiert `SKIP_PAUSE_DAYS` Tage. */
export const SKIP_PAUSE_STREAK = 3;
export const SKIP_PAUSE_DAYS = 30;

export function isSelfReportKind(value: unknown): value is SelfReportKind {
  return typeof value === "string" && (SELF_REPORT_KINDS as readonly string[]).includes(value);
}

/** Wert prüfen und vereinheitlichen; null, wenn er für diese Art nicht erlaubt ist. Zahlen werden als Text verglichen. */
export function parseSelfReportValue(kind: SelfReportKind, raw: unknown): string | null {
  const text = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : typeof raw === "string" ? raw.trim() : null;
  return text !== null && SELF_REPORT_VALUES[kind].includes(text) ? text : null;
}
