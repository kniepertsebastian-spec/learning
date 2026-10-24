/**
 * „Warum lerne ich das?“ (roadmap_motivation Phase 5): was dieser Kurs für die Person bedeutet, soweit es dafür schon Daten gibt:
 * die Zuweisung durch die Firma (mit Frist) und die eigenen, gespeicherten Karrierepfade, in denen der Kurs vorkommt. Beides ist
 * die eigene Sicht der Person; es geht nichts an Dritte.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { careerSuggestions, companyAssignments } from "@/lib/server/db/schema";

export type CourseRelevance = {
  /** Zuweisung durch die Firma, falls vorhanden und noch nicht abgeschlossen. */
  assignment: { dueAt: string | null } | null;
  /** Titel der gespeicherten Karrierepfade, die diesen Kurs enthalten (höchstens 2). */
  careerPaths: string[];
};

/** Titel der Pfade, die den Kurs nennen. Reine Funktion über die gespeicherten Pfade (jsonb, nicht vertrauenswürdig geformt). */
export function careerPathsForCourse(paths: unknown, courseId: string, max = 2): string[] {
  if (!Array.isArray(paths)) return [];
  const titles: string[] = [];
  for (const path of paths) {
    const p = path as { title?: unknown; courses?: unknown };
    if (typeof p?.title !== "string" || !Array.isArray(p.courses)) continue;
    if (p.courses.some((c) => (c as { courseId?: unknown })?.courseId === courseId)) titles.push(p.title);
    if (titles.length >= max) break;
  }
  return titles;
}

export async function loadCourseRelevance(userId: string, courseId: string): Promise<CourseRelevance> {
  const db = getDb();
  const [[assignment], [career]] = await Promise.all([
    db
      .select({ dueAt: companyAssignments.dueAt, status: companyAssignments.status })
      .from(companyAssignments)
      .where(and(eq(companyAssignments.userId, userId), eq(companyAssignments.certificationId, courseId)))
      .limit(1),
    db.select({ paths: careerSuggestions.paths }).from(careerSuggestions).where(eq(careerSuggestions.userId, userId)).limit(1),
  ]);
  return {
    assignment: assignment && assignment.status !== "completed" ? { dueAt: assignment.dueAt?.toISOString() ?? null } : null,
    careerPaths: careerPathsForCourse(career?.paths, courseId),
  };
}
