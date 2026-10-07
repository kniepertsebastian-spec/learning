import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import {
  assignmentNotices,
  certifications,
  companyAssignments,
  mandatoryRules,
  organizationMemberships,
  organizations,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { appUrl, getMailConfig } from "@/lib/server/mail/config";
import { sendMail } from "@/lib/server/mail/mailer";
import { deadlineReminderMessage, overdueDigestMessage, overdueMessage } from "@/lib/server/mail/templates";
import { listAssignableLearningPaths } from "./assignments";

/**
 * Pflichtschulungen: eine Regel macht einen Lernpfad für Rollen der Firma verpflichtend, mit Frist (Tage ab
 * Zuweisung). Sie wirkt beim Anlegen auf die vorhandenen Mitglieder dieser Rollen und danach auf neue Mitglieder.
 * Der tägliche Lauf (`npm run mandatory:run`) erinnert vor der Frist, meldet Überfälliges der Person und eskaliert
 * nach einigen Tagen an Mentor und Firmen-Admin. Gelesen werden nur Zuweisungsstände und Fristen, nie Lerndaten.
 *
 * Bewusst nicht enthalten: Wiederholung (erneute Runde nach X Monaten) und Abteilungen. Beides braucht Konzepte, die es
 * noch nicht gibt (Nachweise je Runde, Abteilung als Gruppierung), siehe docs/ROADMAP-TECHNISCH.md.
 */

export const ALL_ROLES: readonly CompanyRole[] = ["company_admin", "mentor", "learner"];
const DAY_MS = 24 * 60 * 60 * 1000;
/** Ohne Regel (manuelle Zuweisung mit Frist) gelten diese Werte für Erinnerung und Eskalation. */
export const DEFAULT_REMINDER_DAYS = 7;
export const DEFAULT_ESCALATE_DAYS = 3;

export class InvalidRuleError extends Error {}
export class UnknownCourseError extends Error {}
export class RuleExistsError extends Error {}
export class RuleNotFoundError extends Error {}

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? (e as { code: unknown }).code : undefined);
  const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause: unknown }).cause : undefined;
  return code(error) === "23505" || code(cause) === "23505";
}

const intBetween = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/** Weist allen Mitgliedern der Rollen den Lernpfad zu, die ihn noch nicht haben. Gibt die neu zugewiesenen Personen zurück. */
async function applyRule(rule: { id: string; organizationId: string; certificationId: string; roles: CompanyRole[]; dueInDays: number }, actorUserId: string | null, now: Date, onlyUserId?: string): Promise<string[]> {
  const db = getDb();
  const members = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, rule.organizationId),
        inArray(organizationMemberships.role, rule.roles),
        ...(onlyUserId ? [eq(organizationMemberships.userId, onlyUserId)] : []),
      ),
    );
  if (members.length === 0) return [];
  const dueAt = new Date(now.getTime() + rule.dueInDays * DAY_MS);
  const inserted = await db
    .insert(companyAssignments)
    .values(members.map((m) => ({ organizationId: rule.organizationId, userId: m.userId, certificationId: rule.certificationId, dueAt, assignedByUserId: actorUserId, mandatoryRuleId: rule.id })))
    .onConflictDoNothing()
    .returning({ userId: companyAssignments.userId });
  return inserted.map((r) => r.userId);
}

export async function createMandatoryRule(input: {
  organizationId: string;
  userId: string;
  certificationId: string;
  roles: string[];
  dueInDays: number;
  reminderDaysBefore?: number;
  escalateAfterDays?: number;
  now?: Date;
}): Promise<{ id: string; assigned: number }> {
  const roles = [...new Set(input.roles)] as CompanyRole[];
  const reminder = input.reminderDaysBefore ?? DEFAULT_REMINDER_DAYS;
  const escalate = input.escalateAfterDays ?? DEFAULT_ESCALATE_DAYS;
  if (roles.length === 0 || !roles.every((r) => ALL_ROLES.includes(r))) throw new InvalidRuleError();
  if (!intBetween(input.dueInDays, 1, 365) || !intBetween(reminder, 0, 60) || !intBetween(escalate, 1, 60)) throw new InvalidRuleError();
  const paths = await listAssignableLearningPaths(input.organizationId);
  if (!paths.some((p) => p.id === input.certificationId)) throw new UnknownCourseError();

  let rule: { id: string };
  try {
    [rule] = await getDb()
      .insert(mandatoryRules)
      .values({ organizationId: input.organizationId, certificationId: input.certificationId, roles, dueInDays: input.dueInDays, reminderDaysBefore: reminder, escalateAfterDays: escalate, createdByUserId: input.userId })
      .returning({ id: mandatoryRules.id });
  } catch (error) {
    if (isUniqueViolation(error)) throw new RuleExistsError();
    throw error;
  }
  const assigned = await applyRule({ id: rule.id, organizationId: input.organizationId, certificationId: input.certificationId, roles, dueInDays: input.dueInDays }, input.userId, input.now ?? new Date());
  await recordAuditEvent({
    actorUserId: input.userId,
    action: "mandatory_rule.created",
    targetType: "mandatory_rule",
    targetId: rule.id,
    metadata: { organizationId: input.organizationId, assigned },
  }).catch(logAuditFailure);
  return { id: rule.id, assigned: assigned.length };
}

/** Löscht die Regel der eigenen Firma. Bestehende Zuweisungen bleiben (sie sind dann normale Zuweisungen). */
export async function deleteMandatoryRule(organizationId: string, ruleId: string, actorUserId: string): Promise<void> {
  const [row] = await getDb()
    .delete(mandatoryRules)
    .where(and(eq(mandatoryRules.id, ruleId), eq(mandatoryRules.organizationId, organizationId)))
    .returning({ id: mandatoryRules.id });
  if (!row) throw new RuleNotFoundError();
  await recordAuditEvent({ actorUserId, action: "mandatory_rule.deleted", targetType: "mandatory_rule", targetId: row.id, metadata: { organizationId } }).catch(logAuditFailure);
}

export type MandatoryRuleView = {
  id: string;
  certificationId: string;
  learningPath: string;
  roles: CompanyRole[];
  dueInDays: number;
  reminderDaysBefore: number;
  escalateAfterDays: number;
  assigned: number;
  completed: number;
  overdue: number;
};

export async function listMandatoryRules(organizationId: string, now: Date = new Date()): Promise<MandatoryRuleView[]> {
  const rows = await getDb()
    .select({
      id: mandatoryRules.id,
      certificationId: mandatoryRules.certificationId,
      learningPath: certifications.name,
      roles: mandatoryRules.roles,
      dueInDays: mandatoryRules.dueInDays,
      reminderDaysBefore: mandatoryRules.reminderDaysBefore,
      escalateAfterDays: mandatoryRules.escalateAfterDays,
      assigned: sql<number>`count(${companyAssignments.id})::int`,
      completed: sql<number>`count(*) filter (where ${companyAssignments.status} = 'completed')::int`,
      overdue: sql<number>`count(*) filter (where ${companyAssignments.status} <> 'completed' and ${companyAssignments.dueAt} < ${now.toISOString()}::timestamptz)::int`,
    })
    .from(mandatoryRules)
    .innerJoin(certifications, eq(certifications.id, mandatoryRules.certificationId))
    .leftJoin(companyAssignments, eq(companyAssignments.mandatoryRuleId, mandatoryRules.id))
    .where(eq(mandatoryRules.organizationId, organizationId))
    .groupBy(mandatoryRules.id, certifications.name)
    .orderBy(asc(certifications.name));
  return rows;
}

/** Neues Mitglied (z. B. Einladung angenommen): die Pflichtregeln der Firma für seine Rolle greifen sofort. */
export async function applyRulesForNewMember(organizationId: string, userId: string, now: Date = new Date()): Promise<number> {
  const rules = await getDb().select().from(mandatoryRules).where(eq(mandatoryRules.organizationId, organizationId));
  let total = 0;
  for (const rule of rules) total += (await applyRule(rule, null, now, userId)).length;
  return total;
}

export type MaintenanceResult = { reminders: number; overdue: number; escalations: number; skippedNoMail: boolean };

/**
 * Täglicher Lauf: Erinnerung vor der Frist, „überfällig“ an die Person, Eskalation als Sammelmail je Firma an
 * Mentor und Firmen-Admin. Jede Art geht je Zuweisung höchstens einmal raus; der Eintrag wird VOR dem Versand
 * angelegt (parallele Läufe doppeln nichts) und bei einem Fehlschlag wieder entfernt (der nächste Lauf versucht es
 * erneut, z. B. wenn der Versand noch nicht eingerichtet war).
 */
export async function runMandatoryMaintenance(now: Date = new Date()): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { reminders: 0, overdue: 0, escalations: 0, skippedNoMail: false };
  const config = getMailConfig();
  if (!config) return { ...result, skippedNoMail: true };
  const db = getDb();

  const open = await db
    .select({
      id: companyAssignments.id,
      organizationId: companyAssignments.organizationId,
      organizationName: organizations.name,
      userId: companyAssignments.userId,
      email: users.email,
      name: users.name,
      courseName: certifications.name,
      dueAt: companyAssignments.dueAt,
      reminderDays: mandatoryRules.reminderDaysBefore,
      escalateDays: mandatoryRules.escalateAfterDays,
    })
    .from(companyAssignments)
    .innerJoin(users, eq(users.id, companyAssignments.userId))
    .innerJoin(certifications, eq(certifications.id, companyAssignments.certificationId))
    .innerJoin(organizations, eq(organizations.id, companyAssignments.organizationId))
    .leftJoin(mandatoryRules, eq(mandatoryRules.id, companyAssignments.mandatoryRuleId))
    .where(and(ne(companyAssignments.status, "completed"), isNotNull(companyAssignments.dueAt)));
  if (open.length === 0) return result;

  const sentRows = await db
    .select({ assignmentId: assignmentNotices.assignmentId, kind: assignmentNotices.kind })
    .from(assignmentNotices)
    .where(inArray(assignmentNotices.assignmentId, open.map((a) => a.id)));
  const sent = new Set(sentRows.map((r) => `${r.assignmentId}:${r.kind}`));

  /** Legt den Eintrag an; false = schon vorhanden (ein anderer Lauf war schneller). */
  const claim = async (assignmentId: string, kind: "reminder" | "overdue" | "escalation") =>
    (await db.insert(assignmentNotices).values({ assignmentId, kind }).onConflictDoNothing().returning({ id: assignmentNotices.id })).length > 0;
  const release = (assignmentId: string, kind: "reminder" | "overdue" | "escalation") =>
    db.delete(assignmentNotices).where(and(eq(assignmentNotices.assignmentId, assignmentId), eq(assignmentNotices.kind, kind)));

  const link = appUrl("/", config);
  const escalations = new Map<string, { organizationName: string; items: { id: string; person: string; courseName: string; dueAt: Date }[] }>();

  for (const a of open) {
    const dueAt = a.dueAt as Date;
    const reminderDays = a.reminderDays ?? DEFAULT_REMINDER_DAYS;
    const escalateDays = a.escalateDays ?? DEFAULT_ESCALATE_DAYS;
    const remaining = dueAt.getTime() - now.getTime();

    if (remaining > 0) {
      if (reminderDays > 0 && remaining <= reminderDays * DAY_MS && !sent.has(`${a.id}:reminder`) && (await claim(a.id, "reminder"))) {
        const ok = await sendMail(deadlineReminderMessage(a.email, { courseName: a.courseName, organizationName: a.organizationName, dueAt, link }));
        if (ok) result.reminders++;
        else await release(a.id, "reminder");
      }
      continue;
    }
    if (!sent.has(`${a.id}:overdue`) && (await claim(a.id, "overdue"))) {
      const ok = await sendMail(overdueMessage(a.email, { courseName: a.courseName, organizationName: a.organizationName, dueAt, link }));
      if (ok) result.overdue++;
      else await release(a.id, "overdue");
    }
    if (-remaining >= escalateDays * DAY_MS && !sent.has(`${a.id}:escalation`)) {
      const group = escalations.get(a.organizationId) ?? { organizationName: a.organizationName, items: [] };
      group.items.push({ id: a.id, person: a.name ? `${a.name} (${a.email})` : a.email, courseName: a.courseName, dueAt });
      escalations.set(a.organizationId, group);
    }
  }

  for (const [organizationId, group] of escalations) {
    const claimed: typeof group.items = [];
    for (const item of group.items) if (await claim(item.id, "escalation")) claimed.push(item);
    if (claimed.length === 0) continue;
    const recipients = await db
      .select({ email: users.email })
      .from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .where(and(eq(organizationMemberships.organizationId, organizationId), inArray(organizationMemberships.role, ["company_admin", "mentor"])));
    const results = await Promise.all(
      recipients.map((r) => sendMail(overdueDigestMessage(r.email, { organizationName: group.organizationName, items: claimed, link: appUrl("/company", config) }))),
    );
    // Mindestens eine Mail muss rausgegangen sein, sonst nächster Lauf erneut.
    if (results.some(Boolean)) result.escalations += claimed.length;
    else for (const item of claimed) await release(item.id, "escalation");
  }
  return result;
}
