import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, learningExits, lessonCompletions, objectives, sections, studySessions, users, type EvaluationGroup } from "@/lib/server/db/schema";
import { computeEngagementByGroup, utcDay, type EngagementUser } from "./engagement-metrics";

/** Liest die Rohdaten für die Kennzahlen zu Abbruch, Rückkehr und Abschluss (nur Personen mit Evaluationsgruppe, nur bis zum Stichtag). */
export async function loadEngagementUsers(asOf: Date, hash: (userId: string) => string): Promise<EngagementUser[]> {
  const db = getDb();
  const people = await db.select({ id: users.id, group: users.evaluationGroup }).from(users).where(isNotNull(users.evaluationGroup));
  if (people.length === 0) return [];
  const [sessions, deescalated, exits, done, totals] = await Promise.all([
    db.select({ userId: studySessions.userId, completedAt: studySessions.completedAt }).from(studySessions).where(and(eq(studySessions.status, "completed"), isNotNull(studySessions.completedAt), lte(studySessions.completedAt, asOf))),
    db.select({ userId: studySessions.userId, n: sql<number>`count(*)::int` }).from(studySessions).where(and(eq(studySessions.deescalated, true), lte(studySessions.plannedAt, asOf))).groupBy(studySessions.userId),
    db.select({ userId: learningExits.userId, n: sql<number>`count(*)::int` }).from(learningExits).where(lte(learningExits.createdAt, asOf)).groupBy(learningExits.userId),
    db
      .select({ userId: lessonCompletions.userId, certId: domains.certificationId, n: sql<number>`count(*)::int` })
      .from(lessonCompletions)
      .innerJoin(sections, eq(sections.id, lessonCompletions.sectionId))
      .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(lte(lessonCompletions.completedAt, asOf))
      .groupBy(lessonCompletions.userId, domains.certificationId),
    db
      .select({ certId: domains.certificationId, n: sql<number>`count(*)::int` })
      .from(sections)
      .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .groupBy(domains.certificationId),
  ]);
  const totalOf = new Map(totals.map((t) => [t.certId, t.n]));
  const daysOf = new Map<string, Set<string>>();
  const countOf = new Map<string, number>();
  for (const s of sessions) {
    if (!s.completedAt) continue;
    const set = daysOf.get(s.userId) ?? new Set<string>();
    set.add(utcDay(s.completedAt));
    daysOf.set(s.userId, set);
    countOf.set(s.userId, (countOf.get(s.userId) ?? 0) + 1);
  }
  return people.map((p) => ({
    userHash: hash(p.id),
    group: p.group as EvaluationGroup,
    sessionDays: [...(daysOf.get(p.id) ?? [])].sort(),
    sessions: countOf.get(p.id) ?? 0,
    exits: exits.find((e) => e.userId === p.id)?.n ?? 0,
    deescalatedSessions: deescalated.find((d) => d.userId === p.id)?.n ?? 0,
    courses: done.filter((d) => d.userId === p.id).map((d) => ({ done: d.n, total: totalOf.get(d.certId) ?? 0 })),
  }));
}

export async function engagementMetrics(asOf: Date, hash: (userId: string) => string) {
  return computeEngagementByGroup(await loadEngagementUsers(asOf, hash), asOf);
}
