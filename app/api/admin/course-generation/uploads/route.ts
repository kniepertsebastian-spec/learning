import { NextResponse } from "next/server";
import { checkDocumentUploadRateLimit } from "@/lib/server/auth-rate-limit";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { saveCourseGenerationUpload } from "@/lib/server/course-generation/uploads";
import { MAX_DOCUMENT_BYTES } from "@/lib/server/documents/upload";
import { BodyTooLargeError, readFormDataCapped } from "@/lib/server/http/capped-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Betreiber: eine Datei als Quelle für den Kurs-Assistenten hochladen (multipart/form-data, Feld "file"). Antwort: der
 * Verweis (`upload:<id>`), der wie eine Adresse in die Quellenliste des Auftrags kommt, und der Dateiname.
 */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const limit = checkDocumentUploadRateLimit(guard.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Uploads. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await readFormDataCapped(request, MAX_DOCUMENT_BYTES + 1024 * 1024);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ error: `Die Datei ist größer als ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`, code: "too_large" }, { status: 413 });
    }
    return NextResponse.json({ error: "Ungültige Anfrage (multipart/form-data erwartet)." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Es fehlt die Datei (Feld \"file\")." }, { status: 400 });

  const result = await saveCourseGenerationUpload({
    userId: guard.user.id,
    filename: file.name,
    mimeType: file.type,
    data: Buffer.from(await file.arrayBuffer()),
  });
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.code }, { status: 422 });
  return NextResponse.json({ upload: result.upload }, { status: 201 });
}
