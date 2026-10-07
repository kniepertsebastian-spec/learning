import { and, asc, eq, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import { departments, organizationMemberships, users, type CompanyRole } from "@/lib/server/db/schema";
import { applyRulesForMember } from "./mandatory";

/**
 * Abteilungen einer Firma (z. B. „Operations“): frei benannt, vom Firmen-Admin gepflegt, jedes Mitglied hat höchstens
 * eine. Pflichtregeln können auf Abteilungen eingeschränkt werden. Jede Funktion bekommt `organizationId` aus der
 * Mitgliedschaft und filtert immer danach.
 */

export const MAX_DEPARTMENTS = 50;
export class InvalidDepartmentError extends Error {}
export class DepartmentExistsError extends Error {}
export class TooManyDepartmentsError extends Error {}
export class DepartmentNotFoundError extends Error {}
export class NotAMemberError extends Error {}

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? (e as { code: unknown }).code : undefined);
  const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause: unknown }).cause : undefined;
  return code(error) === "23505" || code(cause) === "23505";
}

export type DepartmentView = { id: string; name: string; members: number };

export async function listDepartments(organizationId: string): Promise<DepartmentView[]> {
  return getDb()
    .select({ id: departments.id, name: departments.name, members: sql<number>`count(${organizationMemberships.id})::int` })
    .from(departments)
    .leftJoin(organizationMemberships, eq(organizationMemberships.departmentId, departments.id))
    .where(eq(departments.organizationId, organizationId))
    .groupBy(departments.id)
    .orderBy(asc(departments.name));
}

export async function createDepartment(organizationId: string, name: string, actorUserId: string): Promise<{ id: string }> {
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length < 2 || clean.length > 60) throw new InvalidDepartmentError();
  const [{ n }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(departments).where(eq(departments.organizationId, organizationId));
  if (n >= MAX_DEPARTMENTS) throw new TooManyDepartmentsError();
  try {
    const [row] = await getDb().insert(departments).values({ organizationId, name: clean }).returning({ id: departments.id });
    await recordAuditEvent({ actorUserId, action: "department.created", targetType: "department", targetId: row.id, metadata: { organizationId } }).catch(logAuditFailure);
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new DepartmentExistsError();
    throw error;
  }
}

/** Löscht die Abteilung der eigenen Firma. Mitglieder bleiben ohne Abteilung, Regeln nur für diese Abteilung gelten dann für niemanden mehr. */
export async function deleteDepartment(organizationId: string, departmentId: string, actorUserId: string): Promise<void> {
  const [row] = await getDb()
    .delete(departments)
    .where(and(eq(departments.id, departmentId), eq(departments.organizationId, organizationId)))
    .returning({ id: departments.id });
  if (!row) throw new DepartmentNotFoundError();
  await recordAuditEvent({ actorUserId, action: "department.deleted", targetType: "department", targetId: row.id, metadata: { organizationId } }).catch(logAuditFailure);
}

export type MemberWithDepartment = { userId: string; name: string | null; email: string; role: CompanyRole; departmentId: string | null };

export async function listMembersWithDepartment(organizationId: string): Promise<MemberWithDepartment[]> {
  return getDb()
    .select({ userId: users.id, name: users.name, email: users.email, role: organizationMemberships.role, departmentId: organizationMemberships.departmentId })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(users.email));
}

/**
 * Ordnet ein Mitglied einer Abteilung zu (oder `null` = keine). Wechselt die Abteilung wirklich, greifen die
 * Pflichtregeln, die das für Wechsel vorsehen. Gibt die Zahl neu zugewiesener Lernpfade zurück.
 */
export async function setMemberDepartment(input: { organizationId: string; actorUserId: string; userId: string; departmentId: string | null }): Promise<{ assigned: number }> {
  const db = getDb();
  const [member] = await db
    .select({ id: organizationMemberships.id, departmentId: organizationMemberships.departmentId })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.userId, input.userId), eq(organizationMemberships.organizationId, input.organizationId)))
    .limit(1);
  if (!member) throw new NotAMemberError();
  if (input.departmentId) {
    const [dep] = await db.select({ id: departments.id }).from(departments).where(and(eq(departments.id, input.departmentId), eq(departments.organizationId, input.organizationId))).limit(1);
    if (!dep) throw new DepartmentNotFoundError();
  }
  if (member.departmentId === input.departmentId) return { assigned: 0 };
  await db.update(organizationMemberships).set({ departmentId: input.departmentId }).where(eq(organizationMemberships.id, member.id));
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "department.member_set", targetType: "user", targetId: input.userId, metadata: { organizationId: input.organizationId } }).catch(logAuditFailure);
  const assigned = await applyRulesForMember(input.organizationId, input.userId, "change");
  return { assigned };
}
