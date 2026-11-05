import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { processSyncEvents } from "@/lib/server/sync/service";
import { MAX_SYNC_BODY_BYTES, splitSyncEvents, syncBodySchema } from "@/lib/server/sync/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/sync - R4.3 (roadmap.md): nimmt eine Charge offline
 * aufgezeichneter Ereignisse entgegen und wendet sie idempotent an (siehe
 * lib/server/sync/service.ts). Absichtlich EIN Endpunkt für beide
 * Ereignistypen (section_quiz/study_session) statt getrennter Routen, damit
 * der Client in einem Request synchronisieren kann, was sich offline
 * angesammelt hat. Die Anfrage wird geprüft (lib/server/sync/validate.ts): Form,
 * Größe und Anzahl. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SYNC_BODY_BYTES) {
    return NextResponse.json({ error: "Anfrage zu groß." }, { status: 413 });
  }

  const parsed = syncBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "events must be an array" }, { status: 400 });
  }
  const body = parsed.data;

  // Der Client nennt die Person, der die Warteschlange gehört (Service Worker, Background Sync): bei einer anderen
  // angemeldeten Person nichts übernehmen, die Ereignisse bleiben beim Absender liegen.
  if (body.userId !== undefined && body.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { valid, rejected } = splitSyncEvents(body.events);
  const results = [...rejected, ...(await processSyncEvents(session.user.id, valid))];
  return NextResponse.json({ results });
}
