import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  domains,
  lessons,
  objectives,
  questionOptions,
  questions,
  quizAnswers,
  quizAttempts,
  quizzes,
  sections,
} from "@/lib/server/db/schema";
import type { SectionQuizQuestion } from "@/components/SectionQuiz";
import { chapterState, drawChapterQuestions, type ChapterState } from "@/lib/chapters/logic";
import { completedSectionIds } from "@/lib/server/sections/completed";

/** Lernende sehen nur aktuelle Fragen: veraltete und reine Probe-Fragen gehören nicht in den Pool. */
const poolFilter = (domainId: string) => and(eq(objectives.domainId, domainId), eq(questions.stale, false), eq(questions.probeOnly, false));

/** Wie viele der zuletzt gestellten Versuche beim Ziehen gemieden werden (damit Wiederholungen neue Fragen zeigen). */
const AVOID_LAST_ATTEMPTS = 2;

export interface ChapterQuizDraw {
  domainId: string;
  domainName: string;
  certificationId: string;
  poolSize: number;
  questions: SectionQuizQuestion[];
}

/** Anzahl der Fragen im Pool je Kapitel eines Kurses. */
export async function chapterPoolSizes(certificationId: string): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ domainId: objectives.domainId, id: questions.id })
    .from(questions)
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(domains.certificationId, certificationId), eq(questions.stale, false), eq(questions.probeOnly, false)));
  const sizes = new Map<string, number>();
  for (const r of rows) sizes.set(r.domainId, (sizes.get(r.domainId) ?? 0) + 1);
  return sizes;
}

/** Fragen, die die Person in ihren letzten Kapitel-Quiz-Versuchen gesehen hat. */
async function recentlyShown(userId: string, domainId: string): Promise<Set<string>> {
  const db = getDb();
  const attempts = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(and(eq(quizzes.domainId, domainId), eq(quizAttempts.userId, userId), isNotNull(quizAttempts.completedAt)))
    .orderBy(desc(quizAttempts.completedAt))
    .limit(AVOID_LAST_ATTEMPTS);
  if (attempts.length === 0) return new Set();
  const answered = await db
    .select({ questionId: quizAnswers.questionId })
    .from(quizAnswers)
    .where(inArray(quizAnswers.quizAttemptId, attempts.map((a) => a.id)));
  return new Set(answered.map((a) => a.questionId));
}

/** Zieht 10 zufällige Fragen aus dem Pool des Kapitels (ohne Zurücklegen, bei Wiederholung möglichst neue). */
export async function drawChapterQuiz(userId: string, domainId: string): Promise<ChapterQuizDraw | null> {
  const db = getDb();
  const [domain] = await db.select({ id: domains.id, name: domains.name, certificationId: domains.certificationId }).from(domains).where(eq(domains.id, domainId)).limit(1);
  if (!domain) return null;
  const pool = await db
    .select({ q: questions })
    .from(questions)
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .where(poolFilter(domainId));
  const drawn = drawChapterQuestions(pool.map((p) => p.q), { avoid: await recentlyShown(userId, domainId) });
  const ids = drawn.map((q) => q.id);
  const options = ids.length > 0 ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, ids)).orderBy(questionOptions.orderNum) : [];
  return {
    domainId: domain.id,
    domainName: domain.name,
    certificationId: domain.certificationId,
    poolSize: pool.length,
    questions: drawn.map((q) => ({
      id: q.id,
      question: q.question,
      explanation: q.explanation,
      options: options
        .filter((o) => o.questionId === q.id)
        .map((o) => ({ id: o.id, text: o.text, orderNum: o.orderNum, isCorrect: o.isCorrect, rationale: o.rationale })),
      difficulty: q.difficulty,
      sourceReference: q.sourceReference,
      type: q.type,
      format: q.answerFormat,
      answerData: q.answerData,
    })),
  };
}

export interface ChapterOverview extends ChapterState {
  domainId: string;
  name: string;
  orderNum: number;
  sectionTotal: number;
  sectionsDone: number;
  poolSize: number;
  bestScore: number | null;
  /** IDs der Lektionen dieses Kapitels (mit Inhalt), in Lernreihenfolge. */
  sectionIds: string[];
}

/**
 * Stand aller Kapitel eines Kurses für eine Person: durchgearbeitete Lektionen, Pool-Größe, bestes Ergebnis im Kapitel-Quiz und
 * ob das Kapitel damit abgeschlossen ist. Grundlage für Freischaltungen (Merkzettel, Simulationen).
 */
export async function getChapterOverview(userId: string, certificationId: string): Promise<ChapterOverview[]> {
  const db = getDb();
  const [cert] = await db.select({ quizEnabled: certifications.includeSectionQuizzes }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
  const domainRows = await db.select().from(domains).where(eq(domains.certificationId, certificationId)).orderBy(asc(domains.orderNum));
  if (domainRows.length === 0) return [];

  const sectionRows = await db
    .select({ id: sections.id, domainId: objectives.domainId })
    .from(sections)
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .where(inArray(objectives.domainId, domainRows.map((d) => d.id)))
    .orderBy(asc(objectives.code), asc(sections.orderNum));
  const done = await completedSectionIds(userId, sectionRows.map((s) => s.id));
  const pools = await chapterPoolSizes(certificationId);
  const best = await db
    .select({ domainId: quizzes.domainId, score: quizAttempts.score })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(and(eq(quizAttempts.userId, userId), eq(quizzes.certificationId, certificationId), isNotNull(quizzes.domainId), isNotNull(quizAttempts.completedAt)));
  const bestByDomain = new Map<string, number>();
  for (const b of best) {
    if (!b.domainId || b.score === null) continue;
    bestByDomain.set(b.domainId, Math.max(bestByDomain.get(b.domainId) ?? 0, Number(b.score)));
  }

  return domainRows.map((d) => {
    const own = sectionRows.filter((s) => s.domainId === d.id);
    const sectionsDone = own.filter((s) => done.has(s.id)).length;
    const poolSize = pools.get(d.id) ?? 0;
    const bestScore = bestByDomain.get(d.id) ?? null;
    return {
      domainId: d.id,
      name: d.name,
      orderNum: d.orderNum,
      sectionTotal: own.length,
      sectionsDone,
      poolSize,
      bestScore,
      sectionIds: own.map((s) => s.id),
      ...chapterState({ sectionTotal: own.length, sectionsDone, poolSize, bestScore, quizEnabled: cert?.quizEnabled ?? true }),
    };
  });
}
