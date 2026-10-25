/**
 * Einstufungstest (roadmap_bugs_features 1.1): 10 Auswahlfragen, breit über alle Kapitel des Kurses gestreut.
 * Reine Funktionen ohne Datenbankzugriff.
 */
import { shuffled, type Rng } from "@/lib/chapters/logic";

export const PRE_ASSESSMENT_SIZE = 10;

export interface PreAssessmentCandidate {
  id: string;
  domainId: string;
}

/**
 * Wählt `size` Fragen reihum aus den Kapiteln: erst eine je Kapitel, dann eine zweite je Kapitel usw. Kapitel mit höherem Gewicht
 * kommen zuerst dran; hat der Kurs mehr Kapitel als Fragen, fallen die am geringsten gewichteten weg. Innerhalb eines Kapitels
 * entscheidet der Zufall. Ein Kapitel ohne Fragen wird übersprungen; hat der Kurs weniger Fragen als `size`, kommen alle.
 */
export function pickPreAssessmentQuestions<T extends PreAssessmentCandidate>(
  pool: readonly T[],
  domains: ReadonlyArray<{ id: string; weight: number | null; orderNum: number }>,
  opts: { size?: number; rng?: Rng } = {},
): T[] {
  const size = opts.size ?? PRE_ASSESSMENT_SIZE;
  const rng = opts.rng ?? Math.random;
  const order = [...domains].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.orderNum - b.orderNum);
  const queues = order.map((d) => shuffled(pool.filter((q) => q.domainId === d.id), rng)).filter((q) => q.length > 0);
  const out: T[] = [];
  for (let round = 0; out.length < size; round++) {
    let took = false;
    for (const queue of queues) {
      if (out.length >= size) break;
      if (round < queue.length) {
        out.push(queue[round]);
        took = true;
      }
    }
    if (!took) break;
  }
  return out;
}

export interface PreAssessmentAnswerSummary {
  domainId: string;
  isCorrect: boolean;
}

/** Ergebnis je Kapitel (in der Reihenfolge der Kapitel des Kurses, nur Kapitel mit Fragen im Test). */
export function summarizeByDomain(
  answers: readonly PreAssessmentAnswerSummary[],
  domains: ReadonlyArray<{ id: string; name: string }>,
): Array<{ domainId: string; name: string; correct: number; total: number }> {
  return domains
    .map((d) => {
      const own = answers.filter((a) => a.domainId === d.id);
      return { domainId: d.id, name: d.name, correct: own.filter((a) => a.isCorrect).length, total: own.length };
    })
    .filter((d) => d.total > 0);
}

/** Braucht die Person den Einstufungstest? Nur, wenn es noch kein Ergebnis gibt (auch kein Überspringen) und noch nichts gelernt wurde. */
export function needsPreAssessment(input: { hasRecord: boolean; hasProgress: boolean; testsEnabled: boolean; availableQuestions: number }): boolean {
  return input.testsEnabled && !input.hasRecord && !input.hasProgress && input.availableQuestions > 0;
}
