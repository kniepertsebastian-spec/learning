import { NextResponse } from "next/server";
import { checkDocumentUploadRateLimit } from "@/lib/server/auth-rate-limit";
import { DOCUMENT_ROLES } from "@/lib/server/company/access";
import { listCompanyDocuments, SuppressNotAllowedError, uploadCompanyDocument } from "@/lib/server/company/documents";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { isSuppressible, SECRET_KIND_LABELS, SUPPRESSIBLE_KINDS, type SecretKind } from "@/lib/server/documents/secret-scanner";
import { MAX_DOCUMENT_BYTES } from "@/lib/server/documents/upload";
import { BodyTooLargeError, readFormDataCapped } from "@/lib/server/http/capped-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Firmendokumente der eigenen Organisation (nur Metadaten, nie der Inhalt). */
export async function GET() {
  const guard = await requireCompanyApi(DOCUMENT_ROLES);
  if (!guard.ok) return guard.response;
  const documents = await listCompanyDocuments(guard.membership.organizationId);
  return NextResponse.json({ documents }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Lädt ein Firmendokument hoch (multipart/form-data: file, optional title, excludeFromAi). Es wird auf
 * Typ, lesbaren Text und Zugangsdaten geprüft und nur bei Erfolg gespeichert. Bei Funden antwortet die API
 * mit 422 und nennt Art, Seite und Zeile, nie den Wert. Die Organisation kommt aus der Mitgliedschaft.
 */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(DOCUMENT_ROLES);
  if (!guard.ok) return guard.response;

  const limit = checkDocumentUploadRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Uploads. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // Datei plus Formularfelder; mit Obergrenze lesen, auch wenn der Body in Stücken ohne Content-Length kommt.
  let form: FormData;
  try {
    form = await readFormDataCapped(request, MAX_DOCUMENT_BYTES + 1024 * 1024);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ error: "Die Datei ist zu groß.", code: "too_large" }, { status: 413 });
    }
    return NextResponse.json({ error: "Ungültige Anfrage (multipart/form-data erwartet)." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Es fehlt die Datei (Feld \"file\")." }, { status: 400 });
  }
  const titleRaw = form.get("title");
  const title = typeof titleRaw === "string" ? titleRaw : null;
  const excludeFromAi = form.get("excludeFromAi") === "true" || form.get("excludeFromAi") === "on";
  // Fehlalarme des Scanners bestätigen: Feld "suppressKinds" (mehrfach), nur Arten aus SUPPRESSIBLE_KINDS.
  const suppressKinds = form.getAll("suppressKinds").filter((v): v is string => typeof v === "string");
  if (suppressKinds.some((k) => !SUPPRESSIBLE_KINDS.includes(k as SecretKind))) {
    return NextResponse.json({ error: "Diese Fund-Art lässt sich nicht als Fehlalarm bestätigen.", code: "not_suppressible" }, { status: 400 });
  }

  let result;
  try {
    result = await uploadCompanyDocument({
      organizationId: guard.membership.organizationId,
      uploadedByUserId: guard.membership.userId,
      title,
      file: { filename: file.name, mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) },
      excludeFromAi,
      suppressKinds: suppressKinds as SecretKind[],
      canSuppress: guard.membership.role === "company_admin",
    });
  } catch (error) {
    if (error instanceof SuppressNotAllowedError) {
      return NextResponse.json({ error: "Funde als Fehlalarm bestätigen darf nur ein Firmen-Admin.", code: "suppress_forbidden" }, { status: 403 });
    }
    throw error;
  }

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
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "too_large" ? 413 : 400 });
  }
  return NextResponse.json(
    { document: result.document, alreadyExisted: result.alreadyExisted },
    { status: result.alreadyExisted ? 200 : 201, headers: { "Cache-Control": "no-store" } },
  );
}
