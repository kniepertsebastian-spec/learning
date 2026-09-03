import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import {
  listCertificationSources,
  registerCertificationSource,
  validatePdfUpload,
} from "@/lib/server/admin/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/sources?certificationId=... - Quellen einer Zertifizierung auflisten. */
export async function GET(request: NextRequest) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const certificationId = request.nextUrl.searchParams.get("certificationId");
  if (!certificationId) {
    return NextResponse.json({ error: "certificationId fehlt." }, { status: 400 });
  }

  const sources = await listCertificationSources(certificationId);
  return NextResponse.json({ sources }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/admin/sources (multipart/form-data) - R1.1: Quelle per PDF-Upload
 * registrieren. Felder: certificationId, title, provider, file, optional
 * publishedAt (ISO-Datum). URL-Import ist bewusst (noch) nicht angeboten,
 * siehe roadmap.md R1.1.
 */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage (multipart/form-data erwartet)." }, { status: 400 });
  }

  const certificationId = formData.get("certificationId");
  const title = formData.get("title");
  const provider = formData.get("provider");
  const publishedAtRaw = formData.get("publishedAt");
  const file = formData.get("file");

  if (
    typeof certificationId !== "string" ||
    typeof title !== "string" ||
    typeof provider !== "string" ||
    !title.trim() ||
    !provider.trim() ||
    !(file instanceof File)
  ) {
    return NextResponse.json(
      { error: "certificationId, title, provider und file sind erforderlich." },
      { status: 400 },
    );
  }

  let publishedAt: Date | null = null;
  if (typeof publishedAtRaw === "string" && publishedAtRaw.trim()) {
    const parsed = new Date(publishedAtRaw);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Ungültiges Veröffentlichungsdatum." }, { status: 400 });
    }
    publishedAt = parsed;
  }

  const [certification] = await getDb()
    .select({ id: certifications.id })
    .from(certifications)
    .where(eq(certifications.id, certificationId))
    .limit(1);
  if (!certification) {
    return NextResponse.json({ error: "Zertifizierung nicht gefunden." }, { status: 404 });
  }

  const data = Buffer.from(await file.arrayBuffer());
  const validationError = validatePdfUpload({
    mimeType: file.type,
    fileSizeBytes: data.byteLength,
    data,
  });
  if (validationError) {
    return NextResponse.json(
      { error: validationError.message, code: validationError.code },
      { status: 400 },
    );
  }

  const { source, alreadyExisted } = await registerCertificationSource({
    certificationId,
    title: title.trim(),
    provider: provider.trim(),
    publishedAt,
    data,
    mimeType: file.type,
  });

  return NextResponse.json({ source, alreadyExisted }, { status: alreadyExisted ? 200 : 201 });
}
