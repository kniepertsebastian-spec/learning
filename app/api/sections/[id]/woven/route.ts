import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { isSectionHidden } from "@/lib/server/catalog/access";
import { auth } from "@/lib/server/auth";
import { recordSimulationWovenAnswer } from "@/lib/server/sections/attempt-service";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const body = z.object({ questionId: z.string().regex(UUID), selectedOptionId: z.string().regex(UUID), confidence: z.enum(["guessed", "unsure", "sure"]).optional() });

/** Antwort auf eine eingewebte Frage nach einer Simulation (Flag `woven_reviews`): nur ein Review, zählt nicht für die Lektion. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: sectionId } = await params;
  if (!UUID.test(sectionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  if (await isSectionHidden(session.user.id, sectionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const recorded = await recordSimulationWovenAnswer(session.user.id, sectionId, parsed.data);
  return NextResponse.json({ recorded });
}
