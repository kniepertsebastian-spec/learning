import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
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
  const { certificationId, goalValue, goalType } = parsed.data;

  const existing = await peekActiveOrTodaySession(session.user.id, certificationId);
  if (existing) {
    return NextResponse.json({ session: existing }, { status: 409 });
  }

  try {
    const built = await startStudySession(session.user.id, certificationId, goalValue, goalType);
    return NextResponse.json({ session: built }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const concurrent = await peekActiveOrTodaySession(session.user.id, certificationId);
      if (concurrent) return NextResponse.json({ session: concurrent }, { status: 409 });
    }
    throw error;
  }
}
