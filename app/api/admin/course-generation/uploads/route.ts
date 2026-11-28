import { NextResponse } from "next/server";
import { checkDocumentUploadRateLimit } from "@/lib/server/auth-rate-limit";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { MAX_COURSE_SOURCE_UPLOAD_BYTES, saveCourseGenerationUpload } from "@/lib/server/course-generation/uploads";
import { isSuppressible, SECRET_KIND_LABELS, SUPPRESSIBLE_KINDS, type SecretKind } from "@/lib/server/documents/secret-scanner";
import { BodyTooLargeError, readFormDataCapped } from "@/lib/server/http/capped-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Betreiber: eine Datei als Quelle für den Kurs-Assistenten hochladen (multipart/form-data, Feld "file"). Antwort: der
 * Verweis (`upload:<id>`), der wie eine Adresse in die Quellenliste des Auftrags kommt, und der Dateiname.
 * Bis 25 MB (wie beim Abruf per Adresse). Meldet der Secret-Scanner nur bestätigbare Funde (Beispielwerte in einer
 * öffentlichen Doku), kann der Betreiber sie bestätigen und erneut senden: Feld "suppressKinds" (mehrfach).
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
    form = await readFormDataCapped(request, MAX_COURSE_SOURCE_UPLOAD_BYTES + 1024 * 1024);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ error: `Die Datei ist größer als ${MAX_COURSE_SOURCE_UPLOAD_BYTES / (1024 * 1024)} MB.`, code: "too_large" }, { status: 413 });
    }
    return NextResponse.json({ error: "Ungültige Anfrage (multipart/form-data erwartet)." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Es fehlt die Datei (Feld \"file\")." }, { status: 400 });
  const suppressKinds = form.getAll("suppressKinds").filter((v): v is string => typeof v === "string");
  if (suppressKinds.some((k) => !SUPPRESSIBLE_KINDS.includes(k as SecretKind))) {
    return NextResponse.json({ error: "Diese Fund-Art lässt sich nicht als Fehlalarm bestätigen.", code: "not_suppressible" }, { status: 400 });
  }

  const result = await saveCourseGenerationUpload({
    userId: guard.user.id,
    filename: file.name,
    mimeType: file.type,
    data: Buffer.from(await file.arrayBuffer()),
    suppressKinds: suppressKinds as SecretKind[],
  });
  if (!result.ok) {
    if (result.code === "secrets_found") {
      return NextResponse.json(
        {
          error: result.message,
          code: result.code,
          findings: result.findings.map((f) => ({ ...f, label: SECRET_KIND_LABELS[f.kind].de, suppressible: isSuppressible(f.kind) })),
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "too_large" ? 413 : 422 });
  }
  return NextResponse.json({ upload: result.upload }, { status: 201 });
}
