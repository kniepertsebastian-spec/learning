import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import {
  getStudyProfile,
  upsertStudyProfile,
  StudyProfileValidationError,
  type StudyProfileInput,
} from "@/lib/server/study/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/study-profile/:certId - R2.1: aktuelles Lernprofil abrufen (null,
 * falls noch keins gesetzt wurde - der Client zeigt dann Defaults an). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ certId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { certId } = await params;
  const profile = await getStudyProfile(session.user.id, certId);
  return NextResponse.json({ profile }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * PUT /api/study-profile/:certId - R2.1: "Ziel jederzeit änderbar machen" -
 * überschreibt das Lernprofil vollständig (kein partielles PATCH nötig, das
 * Formular sendet immer den kompletten Zielzustand).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ certId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { certId } = await params;
  const db = getDb();
  const cert = await db.select({ id: certifications.id }).from(certifications).where(eq(certifications.id, certId)).limit(1);
  if (!cert.length) {
    return NextResponse.json({ error: "Certification not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage (JSON erwartet)." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const examDate =
    typeof raw.examDate === "string" && raw.examDate.length > 0 ? new Date(raw.examDate) : null;
  if (examDate !== null && Number.isNaN(examDate.getTime())) {
    return NextResponse.json({ error: "Ungültiges examDate." }, { status: 400 });
  }

  const input: StudyProfileInput = {
    examDate,
    dailyGoalType: raw.dailyGoalType as StudyProfileInput["dailyGoalType"],
    dailyGoalValue: Number(raw.dailyGoalValue),
    activeDays: Array.isArray(raw.activeDays) ? (raw.activeDays as number[]) : [],
    preferredLocale:
      raw.preferredLocale === "de" || raw.preferredLocale === "en" ? raw.preferredLocale : null,
  };

  try {
    const profile = await upsertStudyProfile(session.user.id, certId, input);
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof StudyProfileValidationError) {
      return NextResponse.json({ error: error.errors.join(" ") }, { status: 400 });
    }
    throw error;
  }
}
