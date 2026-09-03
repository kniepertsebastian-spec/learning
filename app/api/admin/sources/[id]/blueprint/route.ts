import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import {
  BlueprintLockedError,
  generateAndStoreBlueprintDraft,
  getBlueprintDraft,
  SourceNotParsedError,
  updateBlueprintDraftContent,
} from "@/lib/server/admin/blueprint";
import { blueprintExtractionSchema } from "@/lib/server/ai/schemas";
import type { BlueprintExtraction } from "@/lib/server/ai/service";
import { checkBlueprintExtractionRateLimit } from "@/lib/server/admin/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/sources/:id/blueprint - R1.2: Importvorschlag anzeigen. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const draft = await getBlueprintDraft(id);
  if (!draft) {
    return NextResponse.json({ error: "Noch kein Blueprint-Vorschlag für diese Quelle." }, { status: 404 });
  }
  return NextResponse.json({ draft }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/admin/sources/:id/blueprint - R1.2: KI-Extraktion starten (ein
 * einzelner, kostenpflichtiger Gemini-Aufruf, daher rate-limited wie die
 * Content-Generierung in R0.3, mit eigenem Bucket).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const rateLimit = checkBlueprintExtractionRateLimit(guard.user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Zu viele Extraktionsstarts. Bitte in ${rateLimit.retryAfterSeconds}s erneut versuchen.`,
      },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const { id } = await params;
  try {
    const draft = await generateAndStoreBlueprintDraft(id, guard.user.id);
    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    if (error instanceof SourceNotParsedError || error instanceof BlueprintLockedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Blueprint-Extraktion fehlgeschlagen.";
    console.error("Blueprint extraction failed:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * PATCH /api/admin/sources/:id/blueprint - R1.3: "Entwurf speichern" - Slug
 * und/oder die extrahierten Domains/Objectives selbst korrigieren
 * ("Felder inline korrigierbar machen"). `content`, falls angegeben, wird
 * gegen dasselbe Schema wie die KI-Ausgabe validiert und errors/warnings
 * darauf neu berechnet. Blockiert mit 409, sobald die Quelle bereits
 * freigegeben oder ersetzt ist.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage (JSON erwartet)." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const rawBody = body as Record<string, unknown>;

  const update: { content?: BlueprintExtraction; suggestedSlug?: string } = {};

  if ("content" in rawBody) {
    const parsed = blueprintExtractionSchema.safeParse(rawBody.content);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Ungültiger Blueprint-Inhalt: ${parsed.error.message}` },
        { status: 400 },
      );
    }
    update.content = parsed.data;
  }

  if ("suggestedSlug" in rawBody) {
    const suggestedSlug = rawBody.suggestedSlug;
    if (typeof suggestedSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(suggestedSlug)) {
      return NextResponse.json(
        { error: "suggestedSlug muss aus Kleinbuchstaben, Ziffern und Bindestrichen bestehen." },
        { status: 400 },
      );
    }
    update.suggestedSlug = suggestedSlug;
  }

  if (update.content === undefined && update.suggestedSlug === undefined) {
    return NextResponse.json(
      { error: "Weder content noch suggestedSlug angegeben." },
      { status: 400 },
    );
  }

  try {
    const draft = await updateBlueprintDraftContent(id, update, guard.user.id);
    if (!draft) {
      return NextResponse.json({ error: "Noch kein Blueprint-Vorschlag für diese Quelle." }, { status: 404 });
    }
    return NextResponse.json({ draft });
  } catch (error) {
    if (error instanceof BlueprintLockedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
