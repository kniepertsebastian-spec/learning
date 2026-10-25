/**
 * Kapitel (= Domain eines Kurses): Quiz am Kapitelende und Freischaltung. Reine Funktionen ohne Datenbankzugriff.
 *
 * „Sitzt das?“ gibt es nur noch am Kapitelende: Pro Kapitel liegt ein Pool von mindestens 30 Fragen bereit, bei jedem Aufruf
 * werden daraus 10 zufällig gezogen (ohne Zurücklegen). Ein Kapitel gilt als abgeschlossen, wenn alle Lektionen durchgearbeitet
 * und das Kapitel-Quiz bestanden ist (gibt es für das Kapitel kein Quiz, genügen die Lektionen).
 */

/** Mindestgröße des Fragenpools je Kapitel (wird beim Erzeugen und im Qualitätsbericht geprüft). */
export const CHAPTER_POOL_MIN = 30;
/** Fragen je Aufruf des Kapitel-Quiz. */
export const CHAPTER_QUIZ_SIZE = 10;
/** Ab diesem Ergebnis (Prozent) gilt das Kapitel-Quiz als bestanden. */
export const CHAPTER_PASS_PERCENT = 70;

/** Zufallszahlen in [0, 1); austauschbar, damit die Ziehung in Tests reproduzierbar ist. */
export type Rng = () => number;

/** Mischt eine Kopie nach Fisher-Yates. */
export function shuffled<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Zieht `size` Fragen zufällig und ohne Zurücklegen. Fragen aus `avoid` (zuletzt gestellte) kommen nur dann dran, wenn der Rest
 * nicht reicht: Wer das Quiz wiederholt, sieht so möglichst neue Fragen. Hat der Pool weniger als `size` Fragen, kommen alle.
 */
export function drawChapterQuestions<T extends { id: string }>(pool: readonly T[], opts: { size?: number; avoid?: ReadonlySet<string>; rng?: Rng } = {}): T[] {
  const size = opts.size ?? CHAPTER_QUIZ_SIZE;
  const rng = opts.rng ?? Math.random;
  const avoid = opts.avoid ?? new Set<string>();
  const unique = [...new Map(pool.map((q) => [q.id, q])).values()];
  const fresh = shuffled(unique.filter((q) => !avoid.has(q.id)), rng);
  if (fresh.length >= size) return fresh.slice(0, size);
  const seen = shuffled(unique.filter((q) => avoid.has(q.id)), rng);
  return [...fresh, ...seen].slice(0, size);
}

/**
 * Verteilt `needed` fehlende Fragen möglichst gleichmäßig auf die Lernziele eines Kapitels (je Lernziel höchstens `cap`).
 * Rückgabe: Anzahl je Lernziel in derselben Reihenfolge; was über die Obergrenze hinausgeht, bleibt für einen weiteren Lauf.
 */
export function distributeMissingQuestions(needed: number, objectiveCount: number, cap = 10): number[] {
  if (needed <= 0 || objectiveCount <= 0) return [];
  const base = Math.floor(needed / objectiveCount);
  const rest = needed % objectiveCount;
  return Array.from({ length: objectiveCount }, (_, i) => Math.min(cap, base + (i < rest ? 1 : 0)));
}

/**
 * Hebt die empfohlene Fragenzahl je Lernziel eines Kapitels so an, dass die Summe `target` erreicht (je Lernziel höchstens `cap`).
 * Verteilt reihum auf die Lernziele mit der niedrigsten Zahl; bereits genügende Kapitel bleiben unverändert.
 */
export function raiseQuestionTargets(counts: readonly number[], target = CHAPTER_POOL_MIN, cap = 10): number[] {
  const out = counts.map((c) => Math.max(1, c));
  let missing = target - out.reduce((s, c) => s + c, 0);
  while (missing > 0) {
    let changed = false;
    // Immer das Lernziel mit der geringsten Zahl zuerst (gleichmäßig auffüllen).
    const order = out.map((c, i) => [c, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, i] of order) {
      if (missing <= 0) break;
      if (out[i] < cap) {
        out[i]++;
        missing--;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

export function chapterQuizPassed(bestScorePercent: number | null): boolean {
  return bestScorePercent !== null && bestScorePercent >= CHAPTER_PASS_PERCENT;
}

export interface ChapterProgressInput {
  sectionTotal: number;
  sectionsDone: number;
  /** Anzahl Fragen im Pool; 0 = es gibt kein Quiz für dieses Kapitel. */
  poolSize: number;
  /** Bestes Ergebnis (Prozent) aller Kapitel-Quiz-Versuche; null = noch keiner. */
  bestScore: number | null;
  /** Kurs ohne Tests: nur die Lektionen zählen. */
  quizEnabled: boolean;
}

export interface ChapterState {
  /** Alle Lektionen des Kapitels durchgearbeitet (ein Kapitel ohne Lektionen gilt nicht als durchgearbeitet). */
  lessonsDone: boolean;
  quizRequired: boolean;
  quizPassed: boolean;
  completed: boolean;
}

export function chapterState(input: ChapterProgressInput): ChapterState {
  const lessonsDone = input.sectionTotal > 0 && input.sectionsDone >= input.sectionTotal;
  const quizRequired = input.quizEnabled && input.poolSize > 0;
  const quizPassed = chapterQuizPassed(input.bestScore);
  return { lessonsDone, quizRequired, quizPassed, completed: lessonsDone && (!quizRequired || quizPassed) };
}
