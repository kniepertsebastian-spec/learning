/** Text, das in beiden Sprachen vorgehalten wird / Text kept in both supported languages. */
export type Locale = "de" | "en";

export type Localized<T> = Record<Locale, T>;

export interface Certificate {
  id: string;
  /** Offizieller Zertifikatsname, sprachneutral (z. B. "CompTIA Security+ SY0-701"). */
  title: string;
  totalDays: number;
  targetDate: string | null;
  createdAt: string;
  /** Fortschritt in Prozent (0-100). */
  progress: number;
}

export interface Module {
  id: string;
  certId: string;
  day: number;
  title: Localized<string>;
  summary: Localized<string>;
  isCompleted: boolean;
  contentMarkdown: Localized<string>;
}

export interface QuizQuestion {
  id: string;
  question: Localized<string>;
  options: Localized<string[]>;
  correctIndex: number;
  explanation: Localized<string>;
}

export interface Quiz {
  id: string;
  certId: string;
  moduleId: string;
  questions: QuizQuestion[];
  score: number | null;
  completedAt: string | null;
}

export interface MockExam {
  id: string;
  certId: string;
  questions: QuizQuestion[];
  score: number | null;
  passed: boolean | null;
  completedAt: string | null;
  durationSeconds: number;
}

/** Eingabedaten zum Speichern einer abgeschlossenen Probeprüfung. */
export interface ExamResult {
  questions: QuizQuestion[];
  score: number;
  passed: boolean;
  durationSeconds: number;
}
