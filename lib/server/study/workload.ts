import { and, eq, isNull, ne, notExists, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, itemStates, itemVariants, lessonCompletions, lessonSkips, lessons, objectives, questions, sections } from "@/lib/server/db/schema";

const DEFAULT_LESSON_MINUTES = 10;

export interface RemainingWorkload {
  /** Geschätzte Lesezeit der Lektionen, die weder abgeschlossen noch per Einstiegstest übersprungen sind. */
  lessonMinutes: number;
  /** Fragen, die diese Person noch nie beantwortet hat. */
  unseenQuestions: number;
}

/** Restaufwand eines Kurses für „Reicht die Zeit?“ im Lernziel (lib/study/time-outlook.ts). */
export async function getRemainingWorkload(userId: string, certificationId: string): Promise<RemainingWorkload> {
  const db = getDb();
  const [lessonRow] = await db
    .select({ minutes: sql<number>`coalesce(sum(coalesce(${sections.estimatedMinutes}, ${DEFAULT_LESSON_MINUTES})), 0)::int` })
    .from(sections)
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .leftJoin(lessonCompletions, and(eq(lessonCompletions.sectionId, sections.id), eq(lessonCompletions.userId, userId)))
    .leftJoin(lessonSkips, and(eq(lessonSkips.sectionId, sections.id), eq(lessonSkips.userId, userId)))
    .where(and(eq(domains.certificationId, certificationId), isNull(lessonCompletions.id), isNull(lessonSkips.id)));

  const [questionRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(questions)
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .leftJoin(itemStates, and(eq(itemStates.itemId, questions.id), eq(itemStates.userId, userId)))
    .where(and(eq(domains.certificationId, certificationId), eq(questions.stale, false), eq(questions.probeOnly, false), isNull(itemStates.itemId), notExists(db.select({ one: sql`1` }).from(itemVariants).where(and(eq(itemVariants.questionId, questions.id), ne(itemVariants.itemId, questions.id))))));

  return { lessonMinutes: lessonRow?.minutes ?? 0, unseenQuestions: questionRow?.count ?? 0 };
}
