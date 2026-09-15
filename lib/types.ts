/** Text, das in beiden Sprachen vorgehalten wird / Text kept in both supported languages. */
export type Locale = "de" | "en";

export type Localized<T> = Record<Locale, T>;

export interface QuizQuestion {
  id: string;
  question: Localized<string>;
  options: Localized<string[]>;
  correctIndex: number;
  explanation: Localized<string>;
}
