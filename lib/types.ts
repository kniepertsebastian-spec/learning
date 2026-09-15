/** Text, das in beiden Sprachen vorgehalten wird / Text kept in both supported languages. */
export type Locale = "de" | "en";

export type Localized<T> = Record<Locale, T>;

/** R2 (roadmap.md): "Sicherheit der eigenen Antwort abfragen" - vom Lernenden
 * VOR der Aufdeckung der Korrektheit selbst eingeschätzt (Kalibrierung
 * zwischen Sicherheit und tatsächlicher Korrektheit ist eine der in R3/29.1
 * genannten Lernwirkungs-Kennzahlen). */
export type AnswerConfidence = "guessed" | "unsure" | "sure";

export interface QuizQuestion {
  id: string;
  question: Localized<string>;
  options: Localized<string[]>;
  correctIndex: number;
  explanation: Localized<string>;
}
