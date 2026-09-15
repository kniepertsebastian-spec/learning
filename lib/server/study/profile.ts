import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { studyProfiles, type StudyGoalType } from "@/lib/server/db/schema";
import type { Locale } from "@/lib/types";

export type StudyProfile = typeof studyProfiles.$inferSelect;

export interface StudyProfileInput {
  examDate: Date | null;
  dailyGoalType: StudyGoalType;
  dailyGoalValue: number;
  /** ISO-Wochentage, 1 (Montag) bis 7 (Sonntag). */
  activeDays: number[];
  preferredLocale: Locale | null;
}

export interface StudyProfileValidationResult {
  errors: string[];
}

/**
 * R2.1 (roadmap.md): Plausibilitätsprüfung eines Lernziel-Updates - reine
 * Funktion (kein DB-Zugriff), analog zu validateBlueprintDraft() in
 * lib/server/admin/blueprint.ts. Bewusst keine Prüfung, ob `examDate` in der
 * Zukunft liegt: das wäre zeitabhängig (schwer sauber testbar) und ein
 * bereits vergangenes Datum stehen zu lassen schadet niemandem - die
 * Session-Priorisierung (R2.3) kann ein abgelaufenes Ziel selbst ignorieren.
 */
export function validateStudyProfileInput(input: StudyProfileInput): StudyProfileValidationResult {
  const errors: string[] = [];

  if (input.dailyGoalType !== "minutes" && input.dailyGoalType !== "questions") {
    errors.push('dailyGoalType muss "minutes" oder "questions" sein.');
  }
  if (!Number.isInteger(input.dailyGoalValue) || input.dailyGoalValue <= 0) {
    errors.push("Tagesziel muss eine positive ganze Zahl sein.");
  }

  if (input.activeDays.length === 0) {
    errors.push("Mindestens ein aktiver Lerntag ist erforderlich.");
  }
  const uniqueDays = new Set(input.activeDays);
  if (uniqueDays.size !== input.activeDays.length) {
    errors.push("Aktive Lerntage dürfen keine Duplikate enthalten.");
  }
  for (const day of input.activeDays) {
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      errors.push(`Ungültiger Wochentag: ${day} (erwartet 1-7, 1 = Montag).`);
    }
  }

  if (
    input.preferredLocale !== null &&
    input.preferredLocale !== "de" &&
    input.preferredLocale !== "en"
  ) {
    errors.push('preferredLocale muss "de", "en" oder null sein.');
  }

  return { errors };
}

export class StudyProfileValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join(" "));
  }
}

export async function getStudyProfile(
  userId: string,
  certificationId: string,
): Promise<StudyProfile | null> {
  const [row] = await getDb()
    .select()
    .from(studyProfiles)
    .where(and(eq(studyProfiles.userId, userId), eq(studyProfiles.certificationId, certificationId)))
    .limit(1);
  return row ?? null;
}

/**
 * R2.1: legt das Lernprofil an oder überschreibt es vollständig (ein
 * Profil pro (Nutzer, Zertifizierung), siehe unique-Constraint) - "Ziel
 * jederzeit änderbar machen". Wirft StudyProfileValidationError statt
 * ungültige Werte zu speichern; nicht in dieser Sandbox gegen eine echte DB
 * getestet (mangels laufender Postgres-Instanz, siehe derselbe Hinweis in
 * blueprint-approval.ts) - validateStudyProfileInput() ist vollständig
 * unit-getestet.
 */
export async function upsertStudyProfile(
  userId: string,
  certificationId: string,
  input: StudyProfileInput,
): Promise<StudyProfile> {
  const { errors } = validateStudyProfileInput(input);
  if (errors.length > 0) throw new StudyProfileValidationError(errors);

  const db = getDb();
  const values = {
    userId,
    certificationId,
    examDate: input.examDate,
    dailyGoalType: input.dailyGoalType,
    dailyGoalValue: input.dailyGoalValue,
    activeDays: input.activeDays,
    preferredLocale: input.preferredLocale,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(studyProfiles)
    .values(values)
    .onConflictDoUpdate({
      target: [studyProfiles.userId, studyProfiles.certificationId],
      set: values,
    })
    .returning();

  return row;
}
