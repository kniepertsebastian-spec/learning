import { NextResponse } from "next/server";
import { checkDocumentImageRateLimit } from "@/lib/server/auth-rate-limit";
import { DOCUMENT_ROLES } from "@/lib/server/company/access";
import { addDocumentImage, AttestationRequiredError, DocumentNotFoundError, listDocumentImages, TooManyImagesError } from "@/lib/server/company/documents";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_DOCUMENT } from "@/lib/server/documents/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Screenshots eines Dokuments der eigenen Firma (nur Name und Größe, nie der Inhalt). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(DOCUMENT_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ images: await listDocumentImages(guard.membership.organizationId, id) }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Hängt einen Screenshot an (multipart/form-data: file, attest="true"). Bilder können nicht auf Zugangsdaten
 * geprüft werden; ohne die Bestätigung, dass nichts Vertrauliches zu sehen ist, wird nichts gespeichert.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(DOCUMENT_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = checkDocumentImageRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zu viele Uploads. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "Das Bild ist zu groß.", code: "too_large" }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage (multipart/form-data erwartet)." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Es fehlt die Datei (Feld \"file\")." }, { status: 400 });
  try {
    const result = await addDocumentImage({
      organizationId: guard.membership.organizationId,
      documentId: id,
      userId: guard.membership.userId,
      attested: form.get("attest") === "true",
      file: { filename: file.name, mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) },
    });
    if (!result.ok) return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "too_large" ? 413 : 400 });
    return NextResponse.json({ image: result.image }, { status: 201 });
  } catch (error) {
    if (error instanceof AttestationRequiredError) {
      return NextResponse.json({ error: "Bitte bestätige, dass auf dem Bild keine Passwörter, Schlüssel oder vertraulichen Daten zu sehen sind.", code: "attestation_required" }, { status: 400 });
    }
    if (error instanceof DocumentNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof TooManyImagesError) return NextResponse.json({ error: `Höchstens ${MAX_IMAGES_PER_DOCUMENT} Bilder je Dokument.`, code: "too_many" }, { status: 409 });
    throw error;
  }
}
