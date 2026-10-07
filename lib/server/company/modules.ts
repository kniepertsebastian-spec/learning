import { and, asc, eq, isNull } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import { certifications, companyAssignments, companyModules, organizationMemberships, users, type CompanyRole } from "@/lib/server/db/schema";
import { listAssignableLearningPaths } from "./assignments";

/**
 * Firmenmodule: kurze Unterlagen der Firma zu einem ihrer Lernpfade, mit verantwortlicher Person und „gültig bis“.
 * Mentor und Firmen-Admin pflegen sie; wer den Lernpfad zugewiesen hat, liest sie; nach Ablauf ist der Inhalt für
 * Lernende verborgen, bis die verantwortliche Person verlängert. Jede Funktion bekommt `organizationId` aus der
 * Mitgliedschaft und filtert immer danach.
 */

export const MAX_MODULE_TITLE = 200;
export const MAX_MODULE_BODY = 20_000;
/** „Läuft bald ab“: so viele Tage vor dem Ablauf wird gewarnt. */
export const EXPIRING_DAYS = 30;
const MAX_YEARS_AHEAD = 5;

export class InvalidModuleError extends Error {}
export class InvalidDateError extends Error {}
export class UnknownPathError extends Error {}
export class InvalidResponsibleError extends Error {}
export class ModuleNotFoundError extends Error {}

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

/** Heutiges Datum (UTC) als YYYY-MM-DD, wie die Fristen der Zuweisungen. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type ModuleState = "valid" | "expiring" | "expired";

/** Reine Entscheidung: „gültig bis“ ist der letzte gültige Tag (einschließlich). */
export function moduleState(validUntil: string, now: Date = new Date()): ModuleState {
  const today = todayIso(now);
  if (validUntil < today) return "expired";
  if (validUntil <= addDaysIso(today, EXPIRING_DAYS)) return "expiring";
  return "valid";
}

function parseValidUntil(value: string, now: Date): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new InvalidDateError();
  // 2026-02-30 wird von Date zu 2026-03-02: nur echte Kalendertage zulassen
  if (new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new InvalidDateError();
  const today = todayIso(now);
  if (value < today) throw new InvalidDateError();
  const latest = new Date(`${today}T00:00:00Z`);
  latest.setUTCFullYear(latest.getUTCFullYear() + MAX_YEARS_AHEAD);
  if (value > latest.toISOString().slice(0, 10)) throw new InvalidDateError();
  return value;
}

function cleanTitle(title: string): string {
  const value = title.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (value.length < 3 || value.length > MAX_MODULE_TITLE) throw new InvalidModuleError();
  return value;
}

function cleanBody(body: string): string {
  // Steuerzeichen raus (Zeilenumbrüche und Tabs bleiben)
  const value = body.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (value.length < 1 || value.length > MAX_MODULE_BODY) throw new InvalidModuleError();
  return value;
}

/** Verantwortlich sein kann, wer Mentor oder Firmen-Admin DIESER Firma ist. */
export async function assertResponsible(organizationId: string, userId: string): Promise<void> {
  const [row] = await getDb()
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.userId, userId)))
    .limit(1);
  if (!row || (row.role !== "company_admin" && row.role !== "mentor")) throw new InvalidResponsibleError();
}

export type ResponsibleOption = { userId: string; name: string | null; email: string };

export async function listResponsibleCandidates(organizationId: string): Promise<ResponsibleOption[]> {
  const rows = await getDb()
    .select({ userId: users.id, name: users.name, email: users.email, role: organizationMemberships.role })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(users.email));
  return rows.filter((r) => (r.role as CompanyRole) !== "learner").map(({ userId, name, email }) => ({ userId, name, email }));
}

export async function createCompanyModule(input: {
  organizationId: string;
  userId: string;
  certificationId: string;
  title: string;
  body: string;
  validUntil: string;
  responsibleUserId?: string | null;
  now?: Date;
}): Promise<{ id: string }> {
  const title = cleanTitle(input.title);
  const body = cleanBody(input.body);
  const validUntil = parseValidUntil(input.validUntil, input.now ?? new Date());
  const responsibleUserId = input.responsibleUserId ?? input.userId;
  await assertResponsible(input.organizationId, responsibleUserId);
  const paths = await listAssignableLearningPaths(input.organizationId);
  if (!paths.some((p) => p.id === input.certificationId)) throw new UnknownPathError();

  const [row] = await getDb()
    .insert(companyModules)
    .values({ organizationId: input.organizationId, certificationId: input.certificationId, title, body, validUntil, responsibleUserId, createdByUserId: input.userId })
    .returning({ id: companyModules.id });
  await recordAuditEvent({
    actorUserId: input.userId,
    action: "company_module.created",
    targetType: "company_module",
    targetId: row.id,
    // Nie Titel oder Inhalt.
    metadata: { organizationId: input.organizationId },
  }).catch(logAuditFailure);
  return row;
}

/** Ändert Felder eines Moduls der eigenen Firma (auch Verlängern über `validUntil`). */
export async function updateCompanyModule(input: {
  organizationId: string;
  userId: string;
  moduleId: string;
  patch: { title?: string; body?: string; validUntil?: string; responsibleUserId?: string };
  now?: Date;
}): Promise<void> {
  const set: Partial<typeof companyModules.$inferInsert> = { updatedAt: new Date() };
  if (input.patch.title !== undefined) set.title = cleanTitle(input.patch.title);
  if (input.patch.body !== undefined) set.body = cleanBody(input.patch.body);
  if (input.patch.validUntil !== undefined) set.validUntil = parseValidUntil(input.patch.validUntil, input.now ?? new Date());
  if (input.patch.responsibleUserId !== undefined) {
    await assertResponsible(input.organizationId, input.patch.responsibleUserId);
    set.responsibleUserId = input.patch.responsibleUserId;
  }
  const [row] = await getDb()
    .update(companyModules)
    .set(set)
    .where(and(eq(companyModules.id, input.moduleId), eq(companyModules.organizationId, input.organizationId), isNull(companyModules.archivedAt)))
    .returning({ id: companyModules.id });
  if (!row) throw new ModuleNotFoundError();
  await recordAuditEvent({
    actorUserId: input.userId,
    action: input.patch.validUntil !== undefined && Object.keys(input.patch).length === 1 ? "company_module.extended" : "company_module.updated",
    targetType: "company_module",
    targetId: input.moduleId,
    metadata: { organizationId: input.organizationId },
  }).catch(logAuditFailure);
}

export async function archiveCompanyModule(organizationId: string, moduleId: string, userId: string): Promise<boolean> {
  const [row] = await getDb()
    .update(companyModules)
    .set({ archivedAt: new Date() })
    .where(and(eq(companyModules.id, moduleId), eq(companyModules.organizationId, organizationId), isNull(companyModules.archivedAt)))
    .returning({ id: companyModules.id });
  if (!row) return false;
  await recordAuditEvent({
    actorUserId: userId,
    action: "company_module.archived",
    targetType: "company_module",
    targetId: moduleId,
    metadata: { organizationId },
  }).catch(logAuditFailure);
  return true;
}

export type ManagedModuleView = {
  id: string;
  certificationId: string;
  learningPath: string;
  title: string;
  body: string;
  validUntil: string;
  state: ModuleState;
  /** Nur wenn die Person noch Mentor oder Firmen-Admin dieser Firma ist; sonst null („ohne Verantwortlichen“). */
  responsibleUserId: string | null;
  responsibleName: string | null;
  responsibleEmail: string | null;
};

/** Verwaltungsansicht (Mentor, Firmen-Admin): alle Module der Firma, die am längsten abgelaufenen zuerst. */
export async function listModulesForOrg(organizationId: string, now: Date = new Date()): Promise<ManagedModuleView[]> {
  const rows = await getDb()
    .select({
      id: companyModules.id,
      certificationId: companyModules.certificationId,
      learningPath: certifications.name,
      title: companyModules.title,
      body: companyModules.body,
      validUntil: companyModules.validUntil,
      responsibleUserId: users.id,
      responsibleName: users.name,
      responsibleEmail: users.email,
      responsibleRole: organizationMemberships.role,
    })
    .from(companyModules)
    .innerJoin(certifications, eq(certifications.id, companyModules.certificationId))
    .leftJoin(users, eq(users.id, companyModules.responsibleUserId))
    .leftJoin(
      organizationMemberships,
      and(eq(organizationMemberships.userId, companyModules.responsibleUserId), eq(organizationMemberships.organizationId, companyModules.organizationId)),
    )
    .where(and(eq(companyModules.organizationId, organizationId), isNull(companyModules.archivedAt)))
    .orderBy(asc(companyModules.validUntil), asc(companyModules.title));
  return rows.map(({ responsibleRole, ...r }) => {
    const stillResponsible = responsibleRole === "company_admin" || responsibleRole === "mentor";
    return {
      ...r,
      state: moduleState(r.validUntil, now),
      responsibleUserId: stillResponsible ? r.responsibleUserId : null,
      responsibleName: stillResponsible ? r.responsibleName : null,
      responsibleEmail: stillResponsible ? r.responsibleEmail : null,
    };
  });
}

export type PathModuleView = {
  id: string;
  title: string;
  /** Null, wenn das Modul abgelaufen ist und die Person es nicht verwaltet. */
  body: string | null;
  validUntil: string;
  state: ModuleState;
  responsible: string | null;
};

/**
 * Module zu EINEM Lernpfad für die Lernpfad-Seite. Sichtbar für die Firma, der sie gehören: Mentor und Firmen-Admin
 * immer, Lernende nur, wenn ihnen der Lernpfad zugewiesen ist. Abgelaufene Module zeigen Lernenden keinen Inhalt.
 */
export async function listModulesForPath(input: {
  organizationId: string;
  userId: string;
  role: CompanyRole;
  certificationId: string;
  now?: Date;
}): Promise<PathModuleView[]> {
  const manager = input.role !== "learner";
  if (!manager) {
    const [assigned] = await getDb()
      .select({ id: companyAssignments.id })
      .from(companyAssignments)
      .where(
        and(
          eq(companyAssignments.organizationId, input.organizationId),
          eq(companyAssignments.userId, input.userId),
          eq(companyAssignments.certificationId, input.certificationId),
        ),
      )
      .limit(1);
    if (!assigned) return [];
  }
  const all = await listModulesForOrg(input.organizationId, input.now);
  return all
    .filter((m) => m.certificationId === input.certificationId)
    .map((m) => ({
      id: m.id,
      title: m.title,
      body: m.state === "expired" && !manager ? null : m.body,
      validUntil: m.validUntil,
      state: m.state,
      responsible: m.responsibleName ?? m.responsibleEmail,
    }));
}
