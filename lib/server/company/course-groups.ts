import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import {
  certifications, companyAssignments, companyCourseEntitlements, companyCourseGroupItems, companyCourseGroups, COURSE_CATEGORY_COLORS, mandatoryRules,
  type CourseCategoryColor,
} from "@/lib/server/db/schema";
import { assignableCondition, assignLearningPath, type AssignResult } from "@/lib/server/company/assignments";
import type { Localized } from "@/lib/types";

/**
 * Firmen-Kursgruppen (UI U6): eigene Zusammenstellungen aus Katalogkursen (mit Freigabe für die Firma), internen Lernpfaden und
 * Pflichtschulungen der eigenen Firma. „Gruppe zuweisen“ erzeugt normale Zuweisungen (gleiche Prüfungen und Regeln wie bei der
 * Einzelzuweisung), vermerkt die Gruppe nur als Herkunft und ändert später nichts automatisch. Es werden nur Status-/Kurstabellen
 * berührt – nie Lerndaten (Architektur-Test).
 */
export class GroupError extends Error {}
export class GroupNotFoundError extends GroupError {}
export class UnknownCourseError extends GroupError {}

export const MAX_GROUP_ITEMS = 30;
export const MAX_GROUPS = 50;

export type CourseKindChip = "catalog" | "internal" | "mandatory";
export interface CompanyGroupView {
  id: string;
  name: Localized<string>;
  color: CourseCategoryColor;
  position: number;
  items: Array<{ certificationId: string; name: string; kind: CourseKindChip }>;
  /** Personen, die über diese Gruppe Zuweisungen haben. */
  people: Array<{ userId: string }>;
}

function cleanName(name: Localized<string>): Localized<string> {
  const de = name.de.trim();
  const en = (name.en.trim() || de).trim();
  if (!de || de.length > 60 || en.length > 60) throw new GroupError("Name: 1 bis 60 Zeichen.");
  return { de, en };
}

/** Prüft, dass jeder Kurs für die Firma freigegeben bzw. ihr eigener ist; gibt sie in der Reihenfolge der Eingabe zurück. */
async function requireAssignableCourses(organizationId: string, certificationIds: string[]): Promise<string[]> {
  const ids = [...new Set(certificationIds)];
  if (ids.length === 0 || ids.length > MAX_GROUP_ITEMS) throw new GroupError(`Eine Gruppe braucht 1 bis ${MAX_GROUP_ITEMS} Kurse.`);
  const rows = await getDb()
    .select({ id: certifications.id })
    .from(certifications)
    .leftJoin(companyCourseEntitlements, and(eq(companyCourseEntitlements.certificationId, certifications.id), eq(companyCourseEntitlements.organizationId, organizationId)))
    .where(and(inArray(certifications.id, ids), assignableCondition(organizationId)));
  if (rows.length !== ids.length) throw new UnknownCourseError();
  return ids;
}

export async function listCourseGroups(organizationId: string): Promise<CompanyGroupView[]> {
  const db = getDb();
  const groups = await db.select().from(companyCourseGroups).where(eq(companyCourseGroups.organizationId, organizationId)).orderBy(asc(companyCourseGroups.position), asc(companyCourseGroups.createdAt));
  if (groups.length === 0) return [];
  const gids = groups.map((g) => g.id);
  const [items, mandatory, people] = await Promise.all([
    db
      .select({ groupId: companyCourseGroupItems.groupId, certificationId: certifications.id, name: certifications.name, kind: certifications.kind, position: companyCourseGroupItems.position })
      .from(companyCourseGroupItems)
      .innerJoin(certifications, eq(certifications.id, companyCourseGroupItems.certificationId))
      .where(inArray(companyCourseGroupItems.groupId, gids))
      .orderBy(asc(companyCourseGroupItems.position)),
    db.select({ certificationId: mandatoryRules.certificationId }).from(mandatoryRules).where(eq(mandatoryRules.organizationId, organizationId)),
    db
      .selectDistinct({ groupId: companyAssignments.groupId, userId: companyAssignments.userId })
      .from(companyAssignments)
      .where(and(eq(companyAssignments.organizationId, organizationId), inArray(companyAssignments.groupId, gids))),
  ]);
  const mandatorySet = new Set(mandatory.map((m) => m.certificationId));
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    position: g.position,
    items: items
      .filter((i) => i.groupId === g.id)
      .map((i) => ({ certificationId: i.certificationId, name: i.name, kind: (mandatorySet.has(i.certificationId) ? "mandatory" : i.kind === "internal" ? "internal" : "catalog") as CourseKindChip })),
    people: people.filter((p) => p.groupId === g.id).map((p) => ({ userId: p.userId })),
  }));
}

export async function createCourseGroup(input: { organizationId: string; actorUserId: string; name: Localized<string>; color: CourseCategoryColor; certificationIds: string[] }): Promise<string> {
  if (!(COURSE_CATEGORY_COLORS as readonly string[]).includes(input.color)) throw new GroupError("Unbekannte Farbe.");
  const name = cleanName(input.name);
  const ids = await requireAssignableCourses(input.organizationId, input.certificationIds);
  const db = getDb();
  const [{ n, max }] = await db.select({ n: sql<number>`count(*)::int`, max: sql<number>`coalesce(max(${companyCourseGroups.position}), 0)` }).from(companyCourseGroups).where(eq(companyCourseGroups.organizationId, input.organizationId));
  if (n >= MAX_GROUPS) throw new GroupError("Zu viele Kursgruppen.");
  const id = await db.transaction(async (tx) => {
    const [g] = await tx.insert(companyCourseGroups).values({ organizationId: input.organizationId, name, color: input.color, position: Number(max) + 1, createdByUserId: input.actorUserId }).returning({ id: companyCourseGroups.id });
    await tx.insert(companyCourseGroupItems).values(ids.map((certificationId, position) => ({ groupId: g.id, certificationId, position })));
    return g.id;
  });
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "company_course_group.create", targetType: "company_course_group", targetId: id, metadata: { organizationId: input.organizationId, courses: ids.length } }).catch(() => {});
  return id;
}

export async function updateCourseGroup(input: { organizationId: string; actorUserId: string; groupId: string; name: Localized<string>; color: CourseCategoryColor; certificationIds: string[] }): Promise<void> {
  const name = cleanName(input.name);
  if (!(COURSE_CATEGORY_COLORS as readonly string[]).includes(input.color)) throw new GroupError("Unbekannte Farbe.");
  const ids = await requireAssignableCourses(input.organizationId, input.certificationIds);
  const db = getDb();
  await db.transaction(async (tx) => {
    const [g] = await tx.update(companyCourseGroups).set({ name, color: input.color }).where(and(eq(companyCourseGroups.id, input.groupId), eq(companyCourseGroups.organizationId, input.organizationId))).returning({ id: companyCourseGroups.id });
    if (!g) throw new GroupNotFoundError();
    await tx.delete(companyCourseGroupItems).where(eq(companyCourseGroupItems.groupId, g.id));
    await tx.insert(companyCourseGroupItems).values(ids.map((certificationId, position) => ({ groupId: g.id, certificationId, position })));
  });
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "company_course_group.update", targetType: "company_course_group", targetId: input.groupId, metadata: { organizationId: input.organizationId, courses: ids.length } }).catch(() => {});
}

export async function deleteCourseGroup(input: { organizationId: string; actorUserId: string; groupId: string }): Promise<void> {
  const [g] = await getDb().delete(companyCourseGroups).where(and(eq(companyCourseGroups.id, input.groupId), eq(companyCourseGroups.organizationId, input.organizationId))).returning({ id: companyCourseGroups.id });
  if (!g) throw new GroupNotFoundError();
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "company_course_group.delete", targetType: "company_course_group", targetId: g.id, metadata: { organizationId: input.organizationId } }).catch(() => {});
}

export type GroupAssignResult = { courses: number; assigned: number; alreadyAssigned: number };

/** Weist jede Person alle Kurse der Gruppe zu (normale Zuweisungen, gemeinsame Frist); bestehende Zuweisungen bleiben unverändert. */
export async function assignCourseGroup(input: { organizationId: string; assignedByUserId: string; groupId: string; userIds: string[]; dueAt: Date | null }): Promise<GroupAssignResult> {
  const db = getDb();
  const [group] = await db.select({ id: companyCourseGroups.id }).from(companyCourseGroups).where(and(eq(companyCourseGroups.id, input.groupId), eq(companyCourseGroups.organizationId, input.organizationId))).limit(1);
  if (!group) throw new GroupNotFoundError();
  const items = await db.select({ certificationId: companyCourseGroupItems.certificationId }).from(companyCourseGroupItems).where(eq(companyCourseGroupItems.groupId, group.id)).orderBy(asc(companyCourseGroupItems.position));
  // Vorab prüfen, damit nicht mitten in der Gruppe abgebrochen wird (z. B. wenn eine Freigabe inzwischen entfallen ist).
  await requireAssignableCourses(input.organizationId, items.map((i) => i.certificationId));
  let assigned = 0;
  let already = 0;
  const results: AssignResult[] = [];
  for (const item of items) {
    results.push(await assignLearningPath({ organizationId: input.organizationId, assignedByUserId: input.assignedByUserId, userIds: input.userIds, certificationId: item.certificationId, dueAt: input.dueAt, groupId: group.id }));
  }
  for (const r of results) {
    assigned += r.assigned.length;
    already += r.alreadyAssigned.length;
  }
  await recordAuditEvent({ actorUserId: input.assignedByUserId, action: "company_course_group.assign", targetType: "company_course_group", targetId: group.id, metadata: { organizationId: input.organizationId, people: input.userIds.length, courses: items.length, assigned } }).catch(() => {});
  return { courses: items.length, assigned, alreadyAssigned: already };
}
