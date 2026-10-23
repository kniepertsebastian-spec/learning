import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { getDb } from "@/lib/server/db/client";
import { energyModeEvents } from "@/lib/server/db/schema";
import { isFeatureEnabled } from "@/lib/server/feature-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  certificationId: z.string().uuid(),
  mode: z.enum(["simulation", "cheat_sheet", "reviews_only", "single_task", "normal"]),
  energy: z.number().int().min(1).max(5).nullable().optional(),
  deescalated: z.boolean().optional(),
});

/** POST /api/energy-mode - hält die Wahl bei niedriger Energie fest (Auswertung „Anteil gewählter Alternativen, Rückkehr am Folgetag“). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("energy_modes", session.user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  if (await isCertificationHidden(session.user.id, parsed.data.certificationId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await getDb().insert(energyModeEvents).values({
    userId: session.user.id,
    certificationId: parsed.data.certificationId,
    mode: parsed.data.mode,
    energyLevel: parsed.data.energy ?? null,
    deescalated: parsed.data.deescalated ?? false,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
