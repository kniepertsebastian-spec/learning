import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { getLearningPreferences, InvalidPreferencesError, saveLearningPreferences } from "@/lib/server/study/learning-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z
  .object({
    weeklyGoalDays: z.number().int().min(1).max(7),
    showStreak: z.boolean(),
    askConfidence: z.boolean(),
    offerCheckin: z.boolean(),
  })
  .partial();

/** GET/PUT /api/learning-preferences - „Wie ich lerne“: Wochenziel, Serie, Sicherheitsangabe, Check-in. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getLearningPreferences(session.user.id), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  try {
    return NextResponse.json(await saveLearningPreferences(session.user.id, parsed.data));
  } catch (error) {
    if (error instanceof InvalidPreferencesError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
