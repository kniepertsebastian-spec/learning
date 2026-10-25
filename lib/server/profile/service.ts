import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  examAttempts,
  exams,
  GERMAN_STATES,
  userCertificates,
  userProfiles,
  userSkills,
  type SkillSource,
} from "@/lib/server/db/schema";

/**
 * Berufliches Profil und Skills (roadmap3.md, Schritt 8). Alles gehört der Person: jede Abfrage filtert nach userId,
 * Firmen sehen davon nichts. Automatisch ergänzte Skills (aus bestandener Abschlussprüfung oder Zertifikat) nur mit
 * Einwilligung (`autoSkills`), mit Herkunft und jederzeit löschbar; selbst eingetragene Skills werden nie überschrieben.
 */

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();

export const profileSchema = z.object({
  jobTitle: optText(120),
  jobDescription: optText(2000),
  focusAreas: optText(2000),
  /** Zielrolle, auf die die Person hinarbeitet (optional). */
  targetRole: optText(120).optional().transform((v) => v ?? null),
  state: z.enum(GERMAN_STATES).nullable(),
});
export type ProfileInput = z.input<typeof profileSchema>;

export const skillSchema = z
  .object({
    kind: z.enum(["skill", "tool"]),
    name: z.string().trim().min(1).max(80),
    level: z.enum(["basic", "confident", "expert"]),
    recency: z.enum(["current", "recent", "older"]).nullable().optional(),
  })
  .transform((s) => ({ ...s, recency: s.kind === "tool" ? (s.recency ?? "current") : null }));
export type SkillInput = z.input<typeof skillSchema>;

export const skillUpdateSchema = z.object({
  level: z.enum(["basic", "confident", "expert"]).optional(),
  recency: z.enum(["current", "recent", "older"]).nullable().optional(),
});

export class SkillExistsError extends Error {}
export class SkillNotFoundError extends Error {}

export async function getProfile(userId: string) {
  const db = getDb();
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  const skills = await db
    .select({ id: userSkills.id, kind: userSkills.kind, name: userSkills.name, level: userSkills.level, recency: userSkills.recency, source: userSkills.source, sourceCourse: certifications.name })
    .from(userSkills)
    .leftJoin(certifications, eq(certifications.id, userSkills.sourceCertificationId))
    .where(eq(userSkills.userId, userId))
    .orderBy(asc(userSkills.kind), asc(sql`lower(${userSkills.name})`));
  return {
    profile: { jobTitle: profile?.jobTitle ?? null, jobDescription: profile?.jobDescription ?? null, focusAreas: profile?.focusAreas ?? null, targetRole: profile?.targetRole ?? null, state: profile?.state ?? null },
    autoSkills: profile?.autoSkills ?? false,
    skills,
  };
}

export async function saveProfile(userId: string, input: ProfileInput) {
  const p = profileSchema.parse(input);
  await getDb()
    .insert(userProfiles)
    .values({ userId, ...p })
    .onConflictDoUpdate({ target: userProfiles.userId, set: { ...p, updatedAt: sql`now()` } });
}

export async function addSkill(userId: string, input: SkillInput): Promise<string> {
  const s = skillSchema.parse(input);
  const [row] = await getDb()
    .insert(userSkills)
    .values({ userId, ...s, source: "manual" })
    .onConflictDoNothing()
    .returning({ id: userSkills.id });
  if (!row) throw new SkillExistsError("Gibt es schon.");
  return row.id;
}

export async function updateSkill(userId: string, id: string, patch: z.infer<typeof skillUpdateSchema>) {
  const p = skillUpdateSchema.parse(patch);
  const [row] = await getDb().update(userSkills).set(p).where(and(eq(userSkills.id, id), eq(userSkills.userId, userId))).returning({ id: userSkills.id });
  if (!row) throw new SkillNotFoundError();
}

export async function deleteSkill(userId: string, id: string) {
  const [row] = await getDb().delete(userSkills).where(and(eq(userSkills.id, id), eq(userSkills.userId, userId))).returning({ id: userSkills.id });
  if (!row) throw new SkillNotFoundError();
}

/**
 * Skill aus einem Kurs ergänzen, wenn die Person das erlaubt hat. Name = Kursname, Stufe „sicher“. Ein selbst
 * eingetragener Skill gleichen Namens bleibt unverändert; ein Kurs-Skill wird durch ein Zertifikat zum Zertifikats-Skill.
 * Fehler werden nur geloggt: das Einreichen einer Prüfung oder das Anlegen eines Zertifikats darf daran nie scheitern.
 */
export async function addSkillFromCourse(userId: string, certificationId: string, source: Exclude<SkillSource, "manual">, force = false): Promise<boolean> {
  try {
    const db = getDb();
    if (!force) {
      const [p] = await db.select({ auto: userProfiles.autoSkills }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
      if (!p?.auto) return false;
    }
    const [cert] = await db.select({ name: certifications.name }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
    if (!cert) return false;
    const [existing] = await db
      .select({ id: userSkills.id, source: userSkills.source })
      .from(userSkills)
      .where(and(eq(userSkills.userId, userId), eq(userSkills.kind, "skill"), sql`lower(${userSkills.name}) = lower(${cert.name})`))
      .limit(1);
    if (existing) {
      if (existing.source === "course" && source === "certificate") await db.update(userSkills).set({ source, sourceCertificationId: certificationId }).where(eq(userSkills.id, existing.id));
      return false;
    }
    await db.insert(userSkills).values({ userId, kind: "skill", name: cert.name, level: "confident", source, sourceCertificationId: certificationId }).onConflictDoNothing();
    return true;
  } catch (error) {
    console.error("[profile] Skill nicht ergänzt:", error);
    return false;
  }
}

/**
 * Einstellung ändern. Beim Einschalten werden Skills aus allen bisher bestandenen Abschlussprüfungen und eingetragenen
 * Zertifikaten zu Kursen nachgetragen; Ausschalten lässt vorhandene Skills stehen (die Person löscht sie selbst).
 */
export async function setAutoSkills(userId: string, enabled: boolean): Promise<{ added: number }> {
  const db = getDb();
  await db
    .insert(userProfiles)
    .values({ userId, autoSkills: enabled })
    .onConflictDoUpdate({ target: userProfiles.userId, set: { autoSkills: enabled, updatedAt: sql`now()` } });
  if (!enabled) return { added: 0 };
  const passed = await db
    .selectDistinct({ certificationId: exams.certificationId })
    .from(examAttempts)
    .innerJoin(exams, eq(exams.id, examAttempts.examId))
    .where(and(eq(examAttempts.userId, userId), eq(examAttempts.passed, true)));
  const certs = await db
    .selectDistinct({ certificationId: userCertificates.certificationId })
    .from(userCertificates)
    .where(and(eq(userCertificates.userId, userId), sql`${userCertificates.certificationId} is not null`));
  let added = 0;
  for (const p of passed) if (await addSkillFromCourse(userId, p.certificationId, "course", true)) added++;
  for (const c of certs) if (c.certificationId && (await addSkillFromCourse(userId, c.certificationId, "certificate", true))) added++;
  return { added };
}
