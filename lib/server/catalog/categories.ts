import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, courseCategories, COURSE_CATEGORY_COLORS, type CourseCategoryColor } from "@/lib/server/db/schema";
import { recordAuditEvent } from "@/lib/server/audit/service";
import type { Localized } from "@/lib/types";

/** Katalog-Kursgruppen (UI U7). Nur allgemeine Kurse (kind = general) lassen sich zuordnen; jede Änderung wird auditiert. */
export class CategoryError extends Error {}
export class CategoryNotFoundError extends CategoryError {}

export type CourseCategory = { id: string; slug: string; name: Localized<string>; color: CourseCategoryColor; position: number };

export function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " und ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "gruppe"
  );
}

export function isCategoryColor(value: string): value is CourseCategoryColor {
  return (COURSE_CATEGORY_COLORS as readonly string[]).includes(value);
}

export async function listCategories(): Promise<CourseCategory[]> {
  return getDb().select().from(courseCategories).orderBy(asc(courseCategories.position), asc(courseCategories.createdAt));
}

function cleanName(name: Localized<string>): Localized<string> {
  const de = name.de.trim();
  const en = name.en.trim();
  if (!de || !en || de.length > 60 || en.length > 60) throw new CategoryError("Name in Deutsch und Englisch, höchstens 60 Zeichen.");
  return { de, en };
}

export async function createCategory(input: { name: Localized<string>; color: CourseCategoryColor; actorUserId: string }): Promise<CourseCategory> {
  const name = cleanName(input.name);
  if (!isCategoryColor(input.color)) throw new CategoryError("Unbekannte Farbe.");
  const db = getDb();
  const base = slugifyName(name.en);
  let slug = base;
  for (let i = 2; ; i++) {
    const [taken] = await db.select({ id: courseCategories.id }).from(courseCategories).where(eq(courseCategories.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${base}-${i}`;
  }
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${courseCategories.position}), 0)` }).from(courseCategories);
  const [row] = await db.insert(courseCategories).values({ slug, name, color: input.color, position: Number(max) + 1 }).returning();
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "course_category.create", targetType: "course_category", targetId: row.id, metadata: { name, color: input.color } });
  return row;
}

export async function renameCategory(input: { id: string; name: Localized<string>; actorUserId: string }): Promise<void> {
  const name = cleanName(input.name);
  const [before] = await getDb().select({ name: courseCategories.name }).from(courseCategories).where(eq(courseCategories.id, input.id)).limit(1);
  if (!before) throw new CategoryNotFoundError();
  await getDb().update(courseCategories).set({ name }).where(eq(courseCategories.id, input.id));
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "course_category.rename", targetType: "course_category", targetId: input.id, metadata: { from: before.name, to: name } });
}

/** Neue Reihenfolge: `ids` muss genau die vorhandenen Gruppen enthalten. */
export async function reorderCategories(input: { ids: string[]; actorUserId: string }): Promise<void> {
  const existing = await listCategories();
  const same = input.ids.length === existing.length && new Set(input.ids).size === existing.length && existing.every((c) => input.ids.includes(c.id));
  if (!same) throw new CategoryError("Die Reihenfolge muss alle Gruppen genau einmal enthalten.");
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const [i, id] of input.ids.entries()) await tx.update(courseCategories).set({ position: i + 1 }).where(eq(courseCategories.id, id));
  });
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "course_category.reorder", targetType: "course_category", metadata: { ids: input.ids } });
}

/** Kurs einer Gruppe zuordnen (`null` = Nicht zugeordnet). Interne Firmenlernpfade sind nicht auffindbar. */
export async function assignCategory(input: { certificationId: string; categoryId: string | null; actorUserId: string }): Promise<{ previous: string | null }> {
  const db = getDb();
  const [cert] = await db
    .select({ id: certifications.id, categoryId: certifications.categoryId })
    .from(certifications)
    .where(and(eq(certifications.id, input.certificationId), eq(certifications.kind, "general")))
    .limit(1);
  if (!cert) throw new CategoryNotFoundError();
  if (input.categoryId) {
    const [cat] = await db.select({ id: courseCategories.id }).from(courseCategories).where(eq(courseCategories.id, input.categoryId)).limit(1);
    if (!cat) throw new CategoryNotFoundError();
  }
  await db.update(certifications).set({ categoryId: input.categoryId }).where(eq(certifications.id, cert.id));
  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: "course_category.assign",
    targetType: "certification",
    targetId: cert.id,
    metadata: { from: cert.categoryId, to: input.categoryId },
  });
  return { previous: cert.categoryId };
}

export async function countUnassigned(): Promise<number> {
  const [row] = await getDb().select({ n: sql<number>`count(*)` }).from(certifications).where(and(isNull(certifications.categoryId), eq(certifications.kind, "general")));
  return Number(row.n);
}
