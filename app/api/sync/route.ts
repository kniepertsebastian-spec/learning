import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { processSyncEvents, type SyncEventInput } from "@/lib/server/sync/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/sync - R4.3 (roadmap.md): nimmt eine Charge offline
 * aufgezeichneter Ereignisse entgegen und wendet sie idempotent an (siehe
 * lib/server/sync/service.ts). Absichtlich EIN Endpunkt für beide
 * Ereignistypen (section_quiz/study_session) statt getrennter Routen, damit
 * der Client in einem Request synchronisieren kann, was sich offline
 * angesammelt hat. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { events: SyncEventInput[] };
  if (!Array.isArray(body.events)) {
    return NextResponse.json({ error: "events must be an array" }, { status: 400 });
  }

  const results = await processSyncEvents(session.user.id, body.events);
  return NextResponse.json({ results });
}
