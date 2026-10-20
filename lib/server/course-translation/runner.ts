import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { translateCourseOverview } from "@/lib/server/course-overview/service";
import { translateCourse } from "./service";

/**
 * In-Prozess-Tracking der Übersetzungsläufe, dasselbe Muster wie die Kursgenerierung (course-generation/runner.ts).
 * Ein Lauf, der durch einen Neustart verloren geht, steht danach als "running" ohne aktiven Prozess da; die
 * Admin-Übersicht zeigt ihn als unterbrochen und bietet den Neustart an, der nur den Rest übersetzt.
 */
const globalForTranslations = globalThis as unknown as { courseTranslations?: Map<string, Promise<void>> };
const active = globalForTranslations.courseTranslations ?? new Map<string, Promise<void>>();
globalForTranslations.courseTranslations = active;

export function isCourseTranslationActive(certificationId: string): boolean {
  return active.has(certificationId);
}

export type StartTranslationResult = "started" | "already_running" | "not_found";

/** Startet die Übersetzung eines Kurses im Hintergrund (höchstens ein Lauf je Kurs). */
export async function startCourseTranslation(certificationId: string): Promise<StartTranslationResult> {
  if (active.has(certificationId)) return "already_running";
  const [cert] = await getDb().select({ id: certifications.id }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
  if (!cert) return "not_found";
  if (active.has(certificationId)) return "already_running";
  await getDb()
    .update(certifications)
    .set({ translationStatus: "running", translationMessage: "Übersetzung gestartet …", translationProcessed: 0, translationTotal: 0 })
    .where(eq(certifications.id, certificationId));
  const run = translateCourse(certificationId)
    // Die Kursbeschreibung gehört dazu, ihr Fehler (oder fehlende Beschreibung) ändert am Kurs nichts.
    .then(() => translateCourseOverview(certificationId).catch((error) => console.error(`Übersetzung der Kursbeschreibung (${certificationId}) fehlgeschlagen:`, error)))
    .then(() => undefined)
    // translateCourse() hält Fehler selbst am Kurs fest; hier nur protokollieren.
    .catch((error) => console.error(`Übersetzung des Kurses ${certificationId} fehlgeschlagen:`, error))
    .finally(() => active.delete(certificationId));
  active.set(certificationId, run);
  return "started";
}

/** Automatischer Lauf nach jeder Veröffentlichung einer Kursgenerierung; COURSE_AUTO_TRANSLATE=0 schaltet ihn ab. */
export function isAutoTranslateEnabled(): boolean {
  return process.env.COURSE_AUTO_TRANSLATE !== "0";
}
