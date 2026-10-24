import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { buildSolution, type AnswerSolution } from "@/lib/questions/answer-formats";
import { domains, lessons, objectives, questionOptions, questions, sections } from "@/lib/server/db/schema";

export type ReviewQuestion = {
  id: string;
  humanId: string;
  question: { de: string; en: string };
  explanation: { de: string; en: string };
  options: Array<{ id: string; text: { de: string; en: string }; isCorrect: boolean; rationale: { de: string; en: string } | null }>;
  /** Nur bei den neuen Antwortformaten (Reihenfolge, Kurzantwort, Zuordnung): die Lösung statt der Optionen. */
  solution?: AnswerSolution;
};
export type ReviewSection = { id: string; title: { de: string; en: string }; content: { de: string; en: string } };
export type ReviewObjective = { id: string; code: string; title: string; sections: ReviewSection[]; questions: ReviewQuestion[] };
export type ReviewDomain = { id: string; name: string; objectives: ReviewObjective[] };

/**
 * Nur Kursinhalt für die Prüfer-Ansicht (Lektionen, Fragen mit Lösung und Erklärung): keine Lerndaten, keine Nutzer, keine Kosten. Die
 * Prüfung der Zuweisung macht der Aufrufer. Veraltete Fragen und reine Abfragevarianten ohne aktive Zuordnung fehlen wie im Kurs selbst.
 */
export async function getReviewerCourseView(certificationId: string): Promise<ReviewDomain[]> {
  const db = getDb();
  const doms = await db.select().from(domains).where(eq(domains.certificationId, certificationId)).orderBy(asc(domains.orderNum));
  if (doms.length === 0) return [];
  const objs = await db.select().from(objectives).where(inArray(objectives.domainId, doms.map((d) => d.id))).orderBy(asc(objectives.code));
  const objIds = objs.map((o) => o.id);
  if (objIds.length === 0) return doms.map((d) => ({ id: d.id, name: d.name, objectives: [] }));
  const [secs, qs] = await Promise.all([
    db.select({ id: sections.id, objectiveId: sections.objectiveId, title: sections.title, content: lessons.content }).from(sections).innerJoin(lessons, eq(lessons.sectionId, sections.id)).where(inArray(sections.objectiveId, objIds)).orderBy(asc(sections.orderNum)),
    db.select({ id: questions.id, humanId: questions.humanId, objectiveId: questions.objectiveId, question: questions.question, explanation: questions.explanation, probeOnly: questions.probeOnly, stale: questions.stale, answerFormat: questions.answerFormat, answerData: questions.answerData }).from(questions).where(inArray(questions.objectiveId, objIds)).orderBy(asc(questions.humanId)),
  ]);
  const shown = qs.filter((q) => !q.stale && !q.probeOnly);
  const opts = shown.length ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, shown.map((q) => q.id))).orderBy(asc(questionOptions.orderNum)) : [];
  return doms.map((d) => ({
    id: d.id,
    name: d.name,
    objectives: objs
      .filter((o) => o.domainId === d.id)
      .map((o) => ({
        id: o.id,
        code: o.code,
        title: o.title,
        sections: secs.filter((s) => s.objectiveId === o.id).map((s) => ({ id: s.id, title: s.title, content: s.content })),
        questions: shown
          .filter((q) => q.objectiveId === o.id)
          .map((q) => ({ id: q.id, humanId: q.humanId, question: q.question, explanation: q.explanation, options: opts.filter((x) => x.questionId === q.id).map((x) => ({ id: x.id, text: x.text, isCorrect: x.isCorrect, rationale: x.rationale ?? null })), ...(q.answerFormat !== "choice" && q.answerData ? { solution: buildSolution(q.answerFormat, q.answerData) } : {}) })),
      })),
  }));
}
