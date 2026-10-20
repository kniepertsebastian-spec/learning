import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { isSectionHidden } from "@/lib/server/catalog/access";
import { auth } from "@/lib/server/auth";
import { recordSimulationSolved, SimulationNotFoundError } from "@/lib/server/simulations/service";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const body = z.object({ simIndex: z.number().int().min(0).max(50), helps: z.number().int().min(0).max(1000) });

/** Eine Simulation der Lektion wurde gelöst (mit `helps` genutzten Hilfen). Gesperrte oder unbekannte Lektionen: 404. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: sectionId } = await params;
  if (!UUID.test(sectionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  if (await isSectionHidden(session.user.id, sectionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(await recordSimulationSolved(session.user.id, sectionId, parsed.data.simIndex, parsed.data.helps));
  } catch (error) {
    if (error instanceof SimulationNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
