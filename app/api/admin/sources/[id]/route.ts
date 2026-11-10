import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { extractSourceContent } from "@/lib/server/admin/source-extraction";
import {
  getCertificationSource,
  MAX_MARKDOWN_BYTES,
  readMarkdownSource,
  SourceEditError,
  updateMarkdownSource,
} from "@/lib/server/admin/sources";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { BodyTooLargeError, readJsonCapped } from "@/lib/server/http/capped-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** JSON maskiert Zeilenumbrüche und Anführungszeichen und wird dadurch länger als der Text selbst. */
const MAX_PATCH_BODY_BYTES = MAX_MARKDOWN_BYTES * 2 + 16 * 1024;

const patchSchema = z
  .object({
    title: z.string().optional(),
    content: z.string().optional(),
  })
  .refine((body) => body.title !== undefined || body.content !== undefined, { message: "title oder content angeben." });

const STATUS_BY_CODE = {
  not_found: 404,
  not_markdown: 400,
  invalid: 400,
  locked: 409,
  duplicate: 409,
} as const;

/**
 * GET /api/admin/sources/:id - der gespeicherte Markdown-Text einer Quelle für den Editor, dazu ob sie sich noch bearbeiten
 * lässt (nur vor Prüfung und Freigabe).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    const { source, content, editable } = await readMarkdownSource(id);
    return NextResponse.json({ source, content, editable }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SourceEditError) return NextResponse.json({ error: error.message, code: error.code }, { status: STATUS_BY_CODE[error.code] });
    throw error;
  }
}

/**
 * PATCH /api/admin/sources/:id (JSON: { title?, content? }) - Titel und/oder Text einer Markdown-Quelle ändern. Ein geänderter Text
 * wird sofort neu ausgelesen (Abschnitte); schlägt das fehl, steht die Quelle auf „failed“ und die Antwort nennt den Grund in
 * `extractionError`. `blueprintDraftExists` sagt, dass ein früher erzeugter Blueprint-Entwurf den alten Text kennt.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  let json: unknown;
  try {
    json = await readJsonCapped(request, MAX_PATCH_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return NextResponse.json({ error: "Der Text ist zu groß." }, { status: 413 });
    return NextResponse.json({ error: "Ungültige Anfrage (JSON erwartet)." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "title oder content angeben." }, { status: 400 });
  }

  const { id } = await params;
  let result;
  try {
    result = await updateMarkdownSource({ sourceId: id, ...parsed.data });
  } catch (error) {
    if (error instanceof SourceEditError) return NextResponse.json({ error: error.message, code: error.code }, { status: STATUS_BY_CODE[error.code] });
    throw error;
  }

  let extractionError: string | null = null;
  if (result.contentChanged) {
    try {
      await extractSourceContent(id);
    } catch (error) {
      extractionError = error instanceof Error ? error.message : "Extraktion fehlgeschlagen.";
    }
  }

  await recordAuditEvent({
    actorUserId: guard.user.id,
    action: "source.edited",
    targetType: "certification_source",
    targetId: id,
    metadata: { contentChanged: result.contentChanged, titleChanged: parsed.data.title !== undefined },
  }).catch((error) => console.error("Audit-Log fehlgeschlagen:", error));

  // Neu laden: extractSourceContent hat den Status inzwischen auf „parsed“ bzw. „failed“ gesetzt.
  const source = (await getCertificationSource(id)) ?? result.source;
  return NextResponse.json({
    source,
    contentChanged: result.contentChanged,
    blueprintDraftExists: result.blueprintDraftExists,
    extractionError,
  });
}
