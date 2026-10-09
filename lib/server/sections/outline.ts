import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, lessonCompletions, lessons, objectives, quizAttempts, quizzes, sections } from "@/lib/server/db/schema";
import type { Localized } from "@/lib/types";

export type OutlineStatus = "done" | "current" | "open";

export interface SectionOutline {
  domain: { name: string; weightPercent: number | null };
  sections: Array<{ id: string; title: Localized<string>; minutes: number | null; status: OutlineStatus; objectiveCode: string }>;
  /** 1-basierte Position der aktuellen Sektion in der Domain. */
  position: number;
  total: number;
  /** Anteil erledigter Sektionen der Domain in Prozent. */
  domainProgress: number;
  prevId: string | null;
  nextId: string | null;
}

/**
 * Gliederung für die Lernseite: alle Sektionen der Domain mit Status. „Erledigt“ ist eine Sektion, wenn die Person sie
 * abgeschlossen (Durcharbeiten) oder ihren Kurz-Check abgelegt hat. Ohne Anmeldung ist nur die aktuelle Sektion markiert.
 */
export async function loadSectionOutline(userId: string | null, sectionId: string): Promise<SectionOutline | null> {
  const db = getDb();
  const [current] = await db
    .select({ domainId: objectives.domainId })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .where(eq(sections.id, sectionId))
    .limit(1);
  if (!current) return null;

  const [domain] = await db.select({ name: domains.name, weight: domains.weightPercent }).from(domains).where(eq(domains.id, current.domainId)).limit(1);
  const rows = await db
    .select({ id: sections.id, title: sections.title, minutes: sections.estimatedMinutes, orderNum: sections.orderNum, code: objectives.code })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .where(eq(objectives.domainId, current.domainId))
    .orderBy(asc(objectives.code), asc(sections.orderNum));

  const ids = rows.map((r) => r.id);
  const done = new Set<string>();
  if (userId && ids.length > 0) {
    const completed = await db
      .select({ id: lessonCompletions.sectionId })
      .from(lessonCompletions)
      .where(and(eq(lessonCompletions.userId, userId), inArray(lessonCompletions.sectionId, ids)));
    completed.forEach((c) => done.add(c.id));
    const attempted = await db
      .select({ id: quizzes.sectionId })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
      .where(and(eq(quizAttempts.userId, userId), isNotNull(quizAttempts.completedAt), inArray(quizzes.sectionId, ids)));
    attempted.forEach((a) => done.add(a.id));
  }

  const list = rows.map((r) => ({
    id: r.id,
    title: r.title,
    minutes: r.minutes,
    objectiveCode: r.code,
    status: (r.id === sectionId ? "current" : done.has(r.id) ? "done" : "open") as OutlineStatus,
  }));
  const index = list.findIndex((s) => s.id === sectionId);
  const doneCount = list.filter((s) => s.status === "done" || (s.status === "current" && done.has(s.id))).length;
  return {
    domain: { name: domain?.name ?? "", weightPercent: domain?.weight ? Number(domain.weight) : null },
    sections: list,
    position: index + 1,
    total: list.length,
    domainProgress: list.length ? Math.round((doneCount / list.length) * 100) : 0,
    prevId: index > 0 ? list[index - 1].id : null,
    nextId: index >= 0 && index < list.length - 1 ? list[index + 1].id : null,
  };
}
