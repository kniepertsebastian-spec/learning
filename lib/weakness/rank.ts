/**
 * Schwächen-Radar (roadmap_bugs_features 5.1): aus den „Sitzt das?“-Quizzes die Themen, die noch Nachbereitung brauchen. Gezählt wird je Frage
 * nur die ZULETZT gegebene Antwort: wer eine früher falsch beantwortete Frage inzwischen richtig hat, gilt dort nicht mehr als schwach.
 */
export interface LatestAnswer {
  objectiveId: string;
  objectiveCode: string;
  objectiveTitle: string;
  questionId: string;
  isCorrect: boolean;
}

export interface WeaknessTopic {
  objectiveId: string;
  code: string;
  title: string;
  /** Fragen des Themas, deren letzte Antwort falsch war. */
  wrong: number;
  /** Fragen des Themas, die überhaupt beantwortet wurden. */
  answered: number;
}

export const WEAKNESS_LIMIT = 3;

/** Die schwächsten Themen: die meisten noch falschen Fragen zuerst, bei Gleichstand der größere Anteil, dann die Nummer. Themen ohne falsche Frage erscheinen nie. */
export function rankWeaknesses(latest: readonly LatestAnswer[], limit = WEAKNESS_LIMIT): WeaknessTopic[] {
  const byObjective = new Map<string, WeaknessTopic>();
  const seen = new Set<string>();
  for (const a of latest) {
    if (seen.has(a.questionId)) continue; // je Frage nur eine (die letzte) Antwort
    seen.add(a.questionId);
    const topic = byObjective.get(a.objectiveId) ?? { objectiveId: a.objectiveId, code: a.objectiveCode, title: a.objectiveTitle, wrong: 0, answered: 0 };
    topic.answered++;
    if (!a.isCorrect) topic.wrong++;
    byObjective.set(a.objectiveId, topic);
  }
  return [...byObjective.values()]
    .filter((t) => t.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.wrong / b.answered - a.wrong / a.answered || a.code.localeCompare(b.code, undefined, { numeric: true }))
    .slice(0, limit);
}
