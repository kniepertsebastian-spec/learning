import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { lessonCompletions, quizAttempts, quizzes } from "@/lib/server/db/schema";

/** Welche der Lektionen eine Person erledigt hat: durchgearbeitet (Abschluss) oder Kurz-Check abgelegt. */
export async function completedSectionIds(userId: string, sectionIds: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  if (sectionIds.length === 0) return done;
  const db = getDb();
  const completed = await db
    .select({ id: lessonCompletions.sectionId })
    .from(lessonCompletions)
    .where(and(eq(lessonCompletions.userId, userId), inArray(lessonCompletions.sectionId, sectionIds)));
  completed.forEach((c) => done.add(c.id));
  const attempted = await db
    .select({ id: quizzes.sectionId })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(and(eq(quizAttempts.userId, userId), isNotNull(quizAttempts.completedAt), inArray(quizzes.sectionId, sectionIds)));
  attempted.forEach((a) => done.add(a.id));
  return done;
}
