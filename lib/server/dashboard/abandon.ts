import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { companyAssignments, courseAbandonments } from "@/lib/server/db/schema";

/** Von der Firma zugewiesene Kurse sind Pflicht und lassen sich nicht selbst abbrechen. */
export async function isAssignedCourse(userId: string, certificationId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: companyAssignments.id })
    .from(companyAssignments)
    .where(and(eq(companyAssignments.userId, userId), eq(companyAssignments.certificationId, certificationId)))
    .limit(1);
  return Boolean(row);
}

/** Kurs aus dem Dashboard nehmen. Fortschritt und Lernprofil bleiben erhalten; wiederholtes Abbrechen ist harmlos. */
export async function abandonCourse(userId: string, certificationId: string): Promise<void> {
  await getDb().insert(courseAbandonments).values({ userId, certificationId }).onConflictDoNothing();
}

/** Kurs wieder aufnehmen (Dashboard zeigt ihn dann wieder). Ohne Abbruch passiert nichts. */
export async function resumeCourse(userId: string, certificationId: string): Promise<void> {
  await getDb()
    .delete(courseAbandonments)
    .where(and(eq(courseAbandonments.userId, userId), eq(courseAbandonments.certificationId, certificationId)));
}
