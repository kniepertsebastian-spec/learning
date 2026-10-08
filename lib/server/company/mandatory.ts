import { and, asc, eq, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import {
  assignmentNotices,
  certifications,
  companyAssignments,
  companyCourseEntitlements,
  departments,
  mandatoryRuleDepartments,
  mandatoryRules,
  organizationMemberships,
  organizations,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { appUrl, getMailConfig } from "@/lib/server/mail/config";
import { sendMail } from "@/lib/server/mail/mailer";
import { deadlineReminderMessage, overdueDigestMessage, overdueMessage, repeatDueMessage } from "@/lib/server/mail/templates";
import { listAssignableLearningPaths } from "./assignments";
import { AlreadyReleasedError, createCourseRequest, DuplicateRequestError } from "./course-requests";

/**
 * Pflichtschulungen: eine Regel macht einen Lernpfad für Rollen der Firma verpflichtend, mit Frist (Tage ab
 * Zuweisung). Sie wirkt beim Anlegen auf die vorhandenen Mitglieder dieser Rollen und danach auf neue Mitglieder.
 * Der tägliche Lauf (`npm run mandatory:run`) erinnert vor der Frist, meldet Überfälliges der Person und eskaliert
 * nach einigen Tagen an Mentor und Firmen-Admin. Gelesen werden nur Zuweisungsstände und Fristen, nie Lerndaten.
 *
 * Wiederholung: Eine Regel kann festlegen, dass X Monate nach dem Abschluss eine neue Runde beginnt. Dabei wird der Status
 * der Zuweisung zurückgesetzt (zugewiesen, neue Frist, neue Erinnerungen); als abgeschlossen zählt dann nur, was nach
 * Beginn der Runde nachgewiesen wurde (siehe assignments/sync.ts). Der letzte Abschluss bleibt in `lastCompletedAt`.
 * Abteilungen: Eine Regel gilt für alle oder für ausgewählte Abteilungen der Firma. Wechselt jemand Rolle oder
 * Abteilung, entscheidet die Regel (`applyOnChange`), ob sie dann greift.
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
/** Wiederholung gewählt, aber die Warnung (Status wird zurückgesetzt) nicht bestätigt. */
export class RepeatNotConfirmedError extends Error {}
export class UnknownDepartmentError extends Error {}

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? (e as { code: unknown }).code : undefined);
  const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause: unknown }).cause : undefined;
  return code(error) === "23505" || code(cause) === "23505";
}

const intBetween = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

type RuleCore = { id: string; organizationId: string; certificationId: string; roles: CompanyRole[]; dueInDays: number; allDepartments: boolean };

/** Weist allen passenden Mitgliedern (Rolle, bei Einschränkung auch Abteilung) den Lernpfad zu, die ihn noch nicht haben. Gibt die neu zugewiesenen Personen zurück. */
async function applyRule(rule: RuleCore, actorUserId: string | null, now: Date, onlyUserId?: string): Promise<string[]> {
  const db = getDb();
  const departmentFilter = rule.allDepartments
    ? []
    : [
        inArray(
          organizationMemberships.departmentId,
          db.select({ id: mandatoryRuleDepartments.departmentId }).from(mandatoryRuleDepartments).where(eq(mandatoryRuleDepartments.ruleId, rule.id)),
        ),
      ];
  const members = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, rule.organizationId),
        inArray(organizationMemberships.role, rule.roles),
        ...departmentFilter,
        ...(onlyUserId ? [eq(organizationMemberships.userId, onlyUserId)] : []),
      ),
    );
  if (members.length === 0) return [];
  const dueAt = new Date(now.getTime() + rule.dueInDays * DAY_MS);
  const inserted = await db
    .insert(companyAssignments)
    .values(members.map((m) => ({ organizationId: rule.organizationId, userId: m.userId, certificationId: rule.certificationId, dueAt, assignedByUserId: actorUserId, mandatoryRuleId: rule.id, assignedAt: now, roundStartedAt: now })))
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
  /** Leer/fehlend = alle Abteilungen. */
  departmentIds?: string[];
  /** Neue Runde so viele Monate nach dem Abschluss (leer = einmalig). */
  repeatEveryMonths?: number | null;
  /** Muss true sein, wenn eine Wiederholung gewählt ist: die Person hat gelesen, dass der Status zurückgesetzt wird. */
  confirmRepeatReset?: boolean;
  /** Regel greift auch bei Wechsel von Rolle oder Abteilung (Standard ja). */
  applyOnChange?: boolean;
  now?: Date;
}): Promise<{ id: string; assigned: number }> {
  const roles = [...new Set(input.roles)] as CompanyRole[];
  const reminder = input.reminderDaysBefore ?? DEFAULT_REMINDER_DAYS;
  const escalate = input.escalateAfterDays ?? DEFAULT_ESCALATE_DAYS;
  if (roles.length === 0 || !roles.every((r) => ALL_ROLES.includes(r))) throw new InvalidRuleError();
  if (!intBetween(input.dueInDays, 1, 365) || !intBetween(reminder, 0, 60) || !intBetween(escalate, 1, 60)) throw new InvalidRuleError();
  const repeat = input.repeatEveryMonths ?? null;
  if (repeat !== null && !intBetween(repeat, 1, 60)) throw new InvalidRuleError();
  if (repeat !== null && input.confirmRepeatReset !== true) throw new RepeatNotConfirmedError();
  const departmentIds = [...new Set(input.departmentIds ?? [])];
  const paths = await listAssignableLearningPaths(input.organizationId);
  // Ein Kurs aus unserem Katalog, der für die Firma noch nicht freigeschaltet ist: die Regel wartet auf die Freischaltung.
  let pendingRelease = false;
  if (!paths.some((p) => p.id === input.certificationId)) {
    const [catalogCourse] = await getDb()
      .select({ id: certifications.id })
      .from(certifications)
      .where(and(eq(certifications.id, input.certificationId), eq(certifications.kind, "general"), eq(certifications.catalogStatus, "approved")))
      .limit(1);
    if (!catalogCourse) throw new UnknownCourseError();
    pendingRelease = true;
  }
  if (departmentIds.length > 0) {
    const own = await getDb().select({ id: departments.id }).from(departments).where(and(eq(departments.organizationId, input.organizationId), inArray(departments.id, departmentIds)));
    if (own.length !== departmentIds.length) throw new UnknownDepartmentError();
  }
  const allDepartments = departmentIds.length === 0;

  let rule: { id: string };
  try {
    rule = await getDb().transaction(async (tx) => {
      const [row] = await tx
        .insert(mandatoryRules)
        .values({
          organizationId: input.organizationId, certificationId: input.certificationId, roles, dueInDays: input.dueInDays,
          reminderDaysBefore: reminder, escalateAfterDays: escalate, repeatEveryMonths: repeat, applyOnChange: input.applyOnChange ?? true,
          allDepartments, pendingRelease, createdByUserId: input.userId,
        })
        .returning({ id: mandatoryRules.id });
      if (!allDepartments) await tx.insert(mandatoryRuleDepartments).values(departmentIds.map((departmentId) => ({ ruleId: row.id, departmentId })));
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new RuleExistsError();
    throw error;
  }
  if (pendingRelease) {
    // Freischaltung anfragen (eine schon offene Anfrage genügt); die Regel wirkt, sobald wir freigeben.
    await createCourseRequest({ organizationId: input.organizationId, requestedByUserId: input.userId, certificationId: input.certificationId }).catch((error) => {
      if (!(error instanceof DuplicateRequestError) && !(error instanceof AlreadyReleasedError)) throw error;
    });
    await recordAuditEvent({
      actorUserId: input.userId,
      action: "mandatory_rule.created",
      targetType: "mandatory_rule",
      targetId: rule.id,
      metadata: { organizationId: input.organizationId, assigned: 0, pendingRelease: true },
    }).catch(logAuditFailure);
    return { id: rule.id, assigned: 0 };
  }
  const assigned = await applyRule({ id: rule.id, organizationId: input.organizationId, certificationId: input.certificationId, roles, dueInDays: input.dueInDays, allDepartments }, input.userId, input.now ?? new Date());
  await recordAuditEvent({
    actorUserId: input.userId,
    action: "mandatory_rule.created",
    targetType: "mandatory_rule",
    targetId: rule.id,
    metadata: { organizationId: input.organizationId, assigned: assigned.length, repeatEveryMonths: repeat },
  }).catch(logAuditFailure);
  return { id: rule.id, assigned: assigned.length };
}

/** Kurse aus unserem Katalog, die für die Firma noch nicht freigeschaltet sind: auch sie lassen sich zur Pflicht machen (die Regel wartet dann auf die Freischaltung). */
export async function listCatalogCoursesForRules(organizationId: string): Promise<{ id: string; name: string }[]> {
  const db = getDb();
  const entitled = await db.select({ id: companyCourseEntitlements.certificationId }).from(companyCourseEntitlements).where(eq(companyCourseEntitlements.organizationId, organizationId));
  return db
    .select({ id: certifications.id, name: certifications.name })
    .from(certifications)
    .where(and(eq(certifications.kind, "general"), eq(certifications.catalogStatus, "approved"), entitled.length > 0 ? notInArray(certifications.id, entitled.map((e) => e.id)) : undefined))
    .orderBy(asc(certifications.name));
}

/**
 * Der Kurs ist für die Firma freigeschaltet: wartende Regeln dafür werden aktiv und weisen den passenden Mitgliedern zu.
 * Ohne Angabe eines Kurses werden alle wartenden Regeln der Firma geprüft, deren Kurs inzwischen freigeschaltet ist
 * (Sicherheitsnetz im täglichen Lauf). Gibt die Zahl neu zugewiesener Personen zurück.
 */
export async function activatePendingRules(organizationId: string, certificationId?: string, now: Date = new Date()): Promise<number> {
  const db = getDb();
  const pending = await db
    .select()
    .from(mandatoryRules)
    .where(and(eq(mandatoryRules.organizationId, organizationId), eq(mandatoryRules.pendingRelease, true), ...(certificationId ? [eq(mandatoryRules.certificationId, certificationId)] : [])));
  if (pending.length === 0) return 0;
  const assignable = new Set((await listAssignableLearningPaths(organizationId)).map((p) => p.id));
  let total = 0;
  for (const rule of pending) {
    if (!assignable.has(rule.certificationId)) continue;
    // Nur wer die Regel wirklich auf „aktiv“ setzt, weist zu (zwei gleichzeitige Freigaben weisen nicht doppelt zu).
    const [claimed] = await db.update(mandatoryRules).set({ pendingRelease: false }).where(and(eq(mandatoryRules.id, rule.id), eq(mandatoryRules.pendingRelease, true))).returning({ id: mandatoryRules.id });
    if (!claimed) continue;
    const assigned = await applyRule(rule, rule.createdByUserId, now);
    total += assigned.length;
    await recordAuditEvent({
      actorUserId: rule.createdByUserId,
      action: "mandatory_rule.activated",
      targetType: "mandatory_rule",
      targetId: rule.id,
      metadata: { organizationId, assigned: assigned.length },
    }).catch(logAuditFailure);
  }
  return total;
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
  repeatEveryMonths: number | null;
  applyOnChange: boolean;
  /** Namen der Abteilungen, auf die die Regel eingeschränkt ist; leer = alle. */
  departments: string[];
  /** Katalogkurs, der noch freigeschaltet werden muss: die Regel wartet und weist noch niemandem zu. */
  pendingRelease: boolean;
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
      repeatEveryMonths: mandatoryRules.repeatEveryMonths,
      applyOnChange: mandatoryRules.applyOnChange,
      allDepartments: mandatoryRules.allDepartments,
      pendingRelease: mandatoryRules.pendingRelease,
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
  const limited = rows.filter((r) => !r.allDepartments).map((r) => r.id);
  const names = limited.length
    ? await getDb()
        .select({ ruleId: mandatoryRuleDepartments.ruleId, name: departments.name })
        .from(mandatoryRuleDepartments)
        .innerJoin(departments, eq(departments.id, mandatoryRuleDepartments.departmentId))
        .where(inArray(mandatoryRuleDepartments.ruleId, limited))
        .orderBy(asc(departments.name))
    : [];
  return rows.map(({ allDepartments, ...r }) => ({ ...r, departments: allDepartments ? [] : names.filter((n) => n.ruleId === r.id).map((n) => n.name) }));
}

/**
 * Regeln für ein Mitglied nachziehen. `join`: neues Mitglied (Einladung angenommen), alle Regeln der Firma. `change`:
 * Rolle oder Abteilung hat gewechselt, nur Regeln, die das ausdrücklich vorsehen (`applyOnChange`). Gibt die Zahl neu
 * zugewiesener Lernpfade zurück.
 */
export async function applyRulesForMember(organizationId: string, userId: string, reason: "join" | "change", now: Date = new Date()): Promise<number> {
  const rules = await getDb()
    .select()
    .from(mandatoryRules)
    .where(and(eq(mandatoryRules.organizationId, organizationId), eq(mandatoryRules.pendingRelease, false), ...(reason === "change" ? [eq(mandatoryRules.applyOnChange, true)] : [])));
  let total = 0;
  for (const rule of rules) total += (await applyRule(rule, null, now, userId)).length;
  return total;
}

/** Zusammenhang zu früher: neues Mitglied. */
export const applyRulesForNewMember = (organizationId: string, userId: string, now: Date = new Date()) => applyRulesForMember(organizationId, userId, "join", now);

/**
 * Wiederholung: Zuweisungen aus Regeln mit Wiederholung, deren Abschluss X Monate zurückliegt, beginnen eine neue Runde.
 * Status zurück auf „zugewiesen“, neue Frist, der letzte Abschluss bleibt vermerkt, die Erinnerungs-Einträge werden
 * gelöscht (damit Erinnerung und Eskalation für die neue Frist wieder laufen). Gibt die betroffenen Zuweisungen mit
 * Empfänger zurück, damit der Aufrufer „Wiederholung fällig“ melden kann.
 */
export async function startDueRepeats(now: Date = new Date(), organizationIds?: string[]): Promise<{ assignmentId: string; email: string; courseName: string; organizationName: string; dueAt: Date }[]> {
  const db = getDb();
  const due = await db
    .select({
      id: companyAssignments.id,
      completedAt: companyAssignments.completedAt,
      months: mandatoryRules.repeatEveryMonths,
      dueInDays: mandatoryRules.dueInDays,
      email: users.email,
      courseName: certifications.name,
      organizationName: organizations.name,
    })
    .from(companyAssignments)
    .innerJoin(mandatoryRules, eq(mandatoryRules.id, companyAssignments.mandatoryRuleId))
    .innerJoin(users, eq(users.id, companyAssignments.userId))
    .innerJoin(certifications, eq(certifications.id, companyAssignments.certificationId))
    .innerJoin(organizations, eq(organizations.id, companyAssignments.organizationId))
    .where(
      and(
        eq(companyAssignments.status, "completed"),
        isNotNull(companyAssignments.completedAt),
        isNotNull(mandatoryRules.repeatEveryMonths),
        ...(organizationIds ? [inArray(companyAssignments.organizationId, organizationIds)] : []),
      ),
    );
  const started: Awaited<ReturnType<typeof startDueRepeats>> = [];
  for (const a of due) {
    const next = new Date(a.completedAt as Date);
    next.setUTCMonth(next.getUTCMonth() + (a.months as number));
    if (next.getTime() > now.getTime()) continue;
    const dueAt = new Date(now.getTime() + a.dueInDays * DAY_MS);
    const reset = await db.transaction(async (tx) => {
      // Nur wenn die Zuweisung noch abgeschlossen ist (ein paralleler Lauf war nicht schneller).
      const [row] = await tx
        .update(companyAssignments)
        .set({ status: "assigned", lastCompletedAt: a.completedAt, completedAt: null, round: sql`${companyAssignments.round} + 1`, roundStartedAt: now, dueAt })
        .where(and(eq(companyAssignments.id, a.id), eq(companyAssignments.status, "completed")))
        .returning({ id: companyAssignments.id });
      if (!row) return false;
      await tx.delete(assignmentNotices).where(eq(assignmentNotices.assignmentId, a.id));
      return true;
    });
    if (reset) started.push({ assignmentId: a.id, email: a.email, courseName: a.courseName, organizationName: a.organizationName, dueAt });
  }
  return started;
}

export type MaintenanceResult = { repeats: number; reminders: number; overdue: number; escalations: number; skippedNoMail: boolean };

/**
 * Täglicher Lauf: Erinnerung vor der Frist, „überfällig“ an die Person, Eskalation als Sammelmail je Firma an
 * Mentor und Firmen-Admin. Jede Art geht je Zuweisung höchstens einmal raus; der Eintrag wird VOR dem Versand
 * angelegt (parallele Läufe doppeln nichts) und bei einem Fehlschlag wieder entfernt (der nächste Lauf versucht es
 * erneut, z. B. wenn der Versand noch nicht eingerichtet war). `options.organizationIds` beschränkt den Lauf auf
 * bestimmte Firmen (für Tests; der tägliche Lauf nimmt alle).
 */
export async function runMandatoryMaintenance(now: Date = new Date(), options: { organizationIds?: string[] } = {}): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { repeats: 0, reminders: 0, overdue: 0, escalations: 0, skippedNoMail: false };
  // Sicherheitsnetz: Regeln, die auf eine Freischaltung warten, die inzwischen erfolgt ist (z. B. direkt in der Datenbank eingetragen).
  const waiting = await getDb()
    .selectDistinct({ organizationId: mandatoryRules.organizationId })
    .from(mandatoryRules)
    .where(and(eq(mandatoryRules.pendingRelease, true), ...(options.organizationIds ? [inArray(mandatoryRules.organizationId, options.organizationIds)] : [])));
  for (const { organizationId } of waiting) await activatePendingRules(organizationId, undefined, now);
  // Neue Runden beginnen unabhängig vom Mailversand (der Status gehört zur Zuweisung, die Mail ist nur ein Hinweis).
  const repeats = await startDueRepeats(now, options.organizationIds);
  result.repeats = repeats.length;
  const config = getMailConfig();
  if (!config) return { ...result, skippedNoMail: true };
  const db = getDb();
  for (const r of repeats) {
    await sendMail(repeatDueMessage(r.email, { courseName: r.courseName, organizationName: r.organizationName, dueAt: r.dueAt, link: appUrl("/", config) })).catch(() => false);
  }

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
    .where(
      and(
        ne(companyAssignments.status, "completed"),
        isNotNull(companyAssignments.dueAt),
        ...(options.organizationIds ? [inArray(companyAssignments.organizationId, options.organizationIds)] : []),
      ),
    );
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
