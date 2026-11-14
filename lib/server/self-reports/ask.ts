/**
 * Welche freiwillige Frage ist jetzt dran? (Aufgabe 18, Review 12.11.2026). Baut auf der Grundlage aus Aufgabe 17 auf
 * (`canAskSelfReport`: Flag, Schalter je Art, 30 Tage Pause nach dreimaligem Überspringen, eine Frage je Lernsitzung) und ergänzt
 * je Ort die Regeln, wann überhaupt gefragt wird. Hier steht nur, WAS gefragt wird. Die Antworten werden gespeichert und
 * ausgewertet; ein Eingriff in die App (Hilfe, Kürzen, Probeprüfung, Format) folgt erst, wenn die Auswertung einen Effekt zeigt.
 *
 * Orte:
 * - `lesson`: nach einer Lektion 5.1 (Anstrengung) oder 5.2 (Vorhersage des Behaltens), im Wechsel, höchstens eine Frage nach einer
 *   Lektion je Tag und je Lektion nur einmal.
 * - `course`: auf der Kursseite einmal je Kurs 5.4 (Grund), solange noch keine Lektion abgeschlossen ist; sonst wöchentlich 5.3
 *   (Zuversicht), solange ein Prüfungstermin in der Zukunft liegt.
 * - `checkin`: im Check-in vor der Sitzung 5.6 (Lernumgebung), höchstens einmal je Tag.
 * 5.5 (Nutzen für die Arbeit) wird noch nicht gefragt: Aufgabe 18 nennt ihn nicht, und er soll selten sein.
 */
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, examPlans, lessonCompletions, objectives, sections, selfReports } from "@/lib/server/db/schema";
import type { SelfReportKind, SelfReportRefType } from "@/lib/self-reports";
import { canAskSelfReport } from "./service";

const DAY_MS = 86_400_000;
/** Nach einer Lektion höchstens eine Frage in diesem Abstand. */
export const LESSON_QUESTION_INTERVAL_MS = DAY_MS;
/** Zuversicht für die Prüfung: wöchentlich. */
export const EXAM_CONFIDENCE_INTERVAL_MS = 7 * DAY_MS;
/** Lernumgebung im Check-in: höchstens einmal je Tag. */
export const ENVIRONMENT_INTERVAL_MS = DAY_MS;

export type AskContext = { context: "lesson"; sectionId: string } | { context: "course"; certificationId: string } | { context: "checkin"; sessionId?: string | null };

export interface SelfReportQuestion {
  kind: SelfReportKind;
  refType: SelfReportRefType | null;
  refId: string | null;
}

/** Zeitpunkt der jüngsten Selbstauskunft dieser Arten (auch übersprungene zählen: gefragt ist gefragt), optional zu einem Bezug. */
async function lastAsked(userId: string, kinds: SelfReportKind[], refId?: string): Promise<{ kind: SelfReportKind; createdAt: Date } | null> {
  const conditions = [eq(selfReports.userId, userId), inArray(selfReports.kind, kinds)];
  if (refId) conditions.push(eq(selfReports.refId, refId));
  const [row] = await getDb()
    .select({ kind: selfReports.kind, createdAt: selfReports.createdAt })
    .from(selfReports)
    .where(and(...conditions))
    .orderBy(desc(selfReports.createdAt))
    .limit(1);
  return row ?? null;
}

async function allowed(userId: string, kind: SelfReportKind, sessionId: string | null | undefined, now: Date): Promise<boolean> {
  return (await canAskSelfReport(userId, kind, { sessionId, now })).ok;
}

/** Die Frage, die jetzt gestellt werden darf, oder null. */
export async function nextSelfReportQuestion(userId: string, ask: AskContext, now: Date = new Date()): Promise<SelfReportQuestion | null> {
  if (ask.context === "lesson") return nextLessonQuestion(userId, ask.sectionId, now);
  if (ask.context === "course") return nextCourseQuestion(userId, ask.certificationId, now);
  return nextCheckinQuestion(userId, ask.sessionId, now);
}

async function nextLessonQuestion(userId: string, sectionId: string, now: Date): Promise<SelfReportQuestion | null> {
  const kinds: SelfReportKind[] = ["effort", "retention_forecast"];
  // Zu dieser Lektion wurde schon gefragt (beantwortet oder übersprungen): nicht noch einmal.
  if (await lastAsked(userId, kinds, sectionId)) return null;
  const last = await lastAsked(userId, kinds);
  if (last && now.getTime() - last.createdAt.getTime() < LESSON_QUESTION_INTERVAL_MS) return null;
  // Im Wechsel: nach 5.1 kommt 5.2 und umgekehrt, angefangen mit 5.1. Ist die dran liegende Art abgeschaltet oder pausiert, die andere.
  const order: SelfReportKind[] = last?.kind === "effort" ? ["retention_forecast", "effort"] : ["effort", "retention_forecast"];
  for (const kind of order) {
    if (await allowed(userId, kind, null, now)) return { kind, refType: "section", refId: sectionId };
  }
  return null;
}

async function nextCourseQuestion(userId: string, certificationId: string, now: Date): Promise<SelfReportQuestion | null> {
  const db = getDb();
  // 5.4: einmal je Kurs, am Anfang (noch keine Lektion dieses Kurses abgeschlossen).
  if (!(await lastAsked(userId, ["learning_reason"], certificationId)) && (await allowed(userId, "learning_reason", null, now))) {
    const [done] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(lessonCompletions)
      .innerJoin(sections, eq(sections.id, lessonCompletions.sectionId))
      .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(and(eq(lessonCompletions.userId, userId), eq(domains.certificationId, certificationId)));
    if ((done?.n ?? 0) === 0) return { kind: "learning_reason", refType: "course", refId: certificationId };
  }
  // 5.3: wöchentlich, solange ein Prüfungstermin in der Zukunft liegt.
  const [plan] = await db
    .select({ id: examPlans.id })
    .from(examPlans)
    .where(and(eq(examPlans.userId, userId), eq(examPlans.certificationId, certificationId), eq(examPlans.status, "planned"), gt(examPlans.scheduledAt, now)))
    .limit(1);
  if (!plan) return null;
  const last = await lastAsked(userId, ["exam_confidence"], certificationId);
  if (last && now.getTime() - last.createdAt.getTime() < EXAM_CONFIDENCE_INTERVAL_MS) return null;
  if (!(await allowed(userId, "exam_confidence", null, now))) return null;
  return { kind: "exam_confidence", refType: "course", refId: certificationId };
}

async function nextCheckinQuestion(userId: string, sessionId: string | null | undefined, now: Date): Promise<SelfReportQuestion | null> {
  const last = await lastAsked(userId, ["learning_environment"]);
  if (last && now.getTime() - last.createdAt.getTime() < ENVIRONMENT_INTERVAL_MS) return null;
  if (!(await allowed(userId, "learning_environment", sessionId, now))) return null;
  return { kind: "learning_environment", refType: "session", refId: sessionId ?? null };
}
