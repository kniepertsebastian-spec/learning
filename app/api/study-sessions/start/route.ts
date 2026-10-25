import { featuresOfCertification, isCertificationHidden } from "@/lib/server/catalog/access";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { resumeCourse } from "@/lib/server/dashboard/abandon";
import {
  peekActiveOrTodaySession,
  startStudySession,
} from "@/lib/server/study/session-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const startSessionSchema = z.object({
  certificationId: z.string().uuid(),
  goalValue: z.number().int().min(1).max(180),
  goalType: z.enum(["minutes", "questions"]).optional(),
  /** R2 (roadmap.md): "optionaler Energiezustand" - freiwillig, wird beim
   * Fehlen einfach nicht berücksichtigt (siehe buildAndPersistSession). */
  energyLevel: z.enum(["low", "medium", "high"]).optional(),
  /** PSRP-HR Phase 4: Check-in, jedes Feld überspringbar (fehlende Werte werden ergänzt und als imputed markiert). */
  checkin: z
    .object({ energyLevel: z.number().int().min(1).max(5).optional(), hadWorkday: z.boolean().optional() })
    .optional(),
  /** Aufgabenart nach Energie: nur Wiederholungen. */
  mode: z.enum(["reviews_only"]).optional(),
});

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

/**
 * POST /api/study-sessions/start - R2 (roadmap.md, neue Fassung): "Nutzer
 * wählt 2, 5, 10 oder 20 Minuten" als primäre Session-Eingabe (siehe
 * StartSessionPicker.tsx). Baut die Session explizit mit dem gewählten
 * Zeitbudget statt dem gespeicherten Tagesziel - ruft daher NICHT
 * getOrCreateStudySession() auf (das würde bei fehlender Session einfach
 * das alte Tagesziel verwenden), sondern startStudySession() direkt, nach
 * demselben "gültige Session existiert bereits?"-Vorab-Check.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = startSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { certificationId, goalValue, goalType, energyLevel, checkin, mode } = parsed.data;
  if (await isCertificationHidden(session.user.id, certificationId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const features = await featuresOfCertification(certificationId);
  if (features && !features.includeSectionQuizzes) {
    return NextResponse.json({ error: "Übungssitzungen gibt es nur bei Lernpfaden mit Lektionstests." }, { status: 409 });
  }

  // Wer wieder lernt, hat den Kurs wieder aufgenommen: er erscheint wieder im Dashboard.
  await resumeCourse(session.user.id, certificationId);

  const existing = await peekActiveOrTodaySession(session.user.id, certificationId);
  if (existing) {
    return NextResponse.json({ session: existing }, { status: 409 });
  }

  try {
    const built = await startStudySession(session.user.id, certificationId, goalValue, goalType, energyLevel, checkin, mode === "reviews_only");
    return NextResponse.json({ session: built }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const concurrent = await peekActiveOrTodaySession(session.user.id, certificationId);
      if (concurrent) return NextResponse.json({ session: concurrent }, { status: 409 });
    }
    throw error;
  }
}
