/** Vorabfragen vor der Lektion (roadmap_didaktik Phase 4.1): 2 Fragen (höchstens 3) aus dem Fragenpool des Lernziels. */
export const PRETEST_QUESTION_COUNT = 2;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Wählt die Vorabfragen stabil je Lektion (gleiche Lektion, gleiche Fragen - die Fragen kommen im Lektionstest wieder).
 * Gibt nichts zurück, wenn der Pool zu klein ist: mindestens ein Rest an Fragen soll dem Lektionstest bleiben.
 */
export function pickPretestQuestions<T extends { id: string }>(questions: T[], sectionId: string, count = PRETEST_QUESTION_COUNT): T[] {
  if (questions.length < count + 1) return [];
  return [...questions].sort((a, b) => hash(`${sectionId}:${a.id}`) - hash(`${sectionId}:${b.id}`) || a.id.localeCompare(b.id)).slice(0, count);
}
