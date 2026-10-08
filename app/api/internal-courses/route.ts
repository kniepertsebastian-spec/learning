import { NextResponse } from "next/server";
import { z } from "zod";
import { checkInternalCourseRateLimit } from "@/lib/server/auth-rate-limit";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { SuppressNotAllowedError, uploadCompanyDocument } from "@/lib/server/company/documents";
import { isSuppressible, SECRET_KIND_LABELS, SUPPRESSIBLE_KINDS, type SecretKind } from "@/lib/server/documents/secret-scanner";
import { getDb } from "@/lib/server/db/client";
import { companyDocuments } from "@/lib/server/db/schema";
import { inArray } from "drizzle-orm";
import { listInternalCourseJobs, listInternalCourses } from "@/lib/server/company/internal-courses-list";
import {
  AiAccessUnavailableError,
  DocumentUnavailableError,
  DuplicateCourseGenerationJobError,
  MAX_FILES_PER_COURSE,
  startInternalCourse,
  TooManyActiveJobsError,
} from "@/lib/server/internal-courses/service";

export const dynamic = "force-dynamic";

/** Nur Firmen-Admin und Mentor. Die Firma kommt aus der Mitgliedschaft, nie aus der Anfrage. */
const ROLES = ["company_admin", "mentor"] as const;

/** Gesamtgröße aller Dateien einer Anfrage. */
const MAX_REQUEST_BYTES = 105 * 1024 * 1024;

const startSchema = z.object({
  documentId: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).min(1).max(MAX_FILES_PER_COURSE).optional(),
  title: z.string().trim().min(1).max(200),
  language: z.enum(["de", "en"]).default("de"),
  includeSectionQuizzes: z.boolean().default(true),
  includeFinalExam: z.boolean().default(true),
});

/** Stand der Erstellung (Aufträge) und die internen Lernpfade der eigenen Firma. */
export async function GET() {
  const guard = await requireCompanyApi(ROLES);
  if (!guard.ok) return guard.response;
  const [jobs, courses] = await Promise.all([
    listInternalCourseJobs(guard.membership.organizationId),
    listInternalCourses(guard.membership.organizationId),
  ]);
  return NextResponse.json({ jobs, courses }, { headers: { "Cache-Control": "no-store" } });
}

/** Startet die KI-Erstellung eines internen Lernpfads aus einem Firmendokument. */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(ROLES);
  if (!guard.ok) return guard.response;
  const { organizationId, userId } = guard.membership;

  const limit = checkInternalCourseRateLimit(organizationId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Aufträge. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  let input: z.infer<typeof startSchema>;
  /** Für diesen Auftrag temporär angelegte Dateien: bei einem Fehler wieder löschen. */
  const temporaryIds: string[] = [];
  if (contentType.startsWith("multipart/form-data")) {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Die Dateien sind zusammen zu groß (höchstens 100 MB).", code: "too_large" }, { status: 413 });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Ungültige Anfrage (multipart/form-data erwartet)." }, { status: 400 });
    }
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const stored = form.getAll("documentIds").filter((v): v is string => typeof v === "string");
    if (files.length + stored.length === 0) return NextResponse.json({ error: "Bitte mindestens eine Datei angeben." }, { status: 400 });
    if (files.length + stored.length > MAX_FILES_PER_COURSE) {
      return NextResponse.json({ error: `Höchstens ${MAX_FILES_PER_COURSE} Dateien je Kurs.` }, { status: 400 });
    }
    const meta = startSchema.omit({ documentId: true, documentIds: true }).safeParse({
      title: form.get("title"),
      language: form.get("language") ?? undefined,
      includeSectionQuizzes: form.get("includeSectionQuizzes") !== "false",
      includeFinalExam: form.get("includeFinalExam") !== "false",
    });
    const storedParsed = z.array(z.string().uuid()).safeParse(stored);
    if (!meta.success || !storedParsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    const suppressKinds = form.getAll("suppressKinds").filter((v): v is string => typeof v === "string");
    if (suppressKinds.some((k) => !SUPPRESSIBLE_KINDS.includes(k as SecretKind))) {
      return NextResponse.json({ error: "Diese Fund-Art lässt sich nicht als Fehlalarm bestätigen.", code: "not_suppressible" }, { status: 400 });
    }
    if (files.reduce((n, f) => n + f.size, 0) > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Die Dateien sind zusammen zu groß (höchstens 100 MB).", code: "too_large" }, { status: 413 });
    }

    // Alles oder nichts: jede Datei wird geprüft (Typ, Text, Scanner); gibt es bei einer einen Fund, entsteht kein Auftrag.
    const problems: { filename: string; message: string; code: string; findings?: unknown[] }[] = [];
    for (const file of files) {
      try {
        const result = await uploadCompanyDocument({
          organizationId,
          uploadedByUserId: userId,
          title: null,
          file: { filename: file.name, mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) },
          excludeFromAi: false,
          suppressKinds: suppressKinds as SecretKind[],
          canSuppress: guard.membership.role === "company_admin",
          temporary: true,
        });
        if (result.ok) temporaryIds.push(result.document.id);
        else {
          problems.push({
            filename: file.name,
            message: result.message,
            code: result.code,
            ...(result.code === "secrets_found"
              ? { findings: result.findings.map((f) => ({ ...f, label: SECRET_KIND_LABELS[f.kind].de, suppressible: isSuppressible(f.kind) })) }
              : {}),
          });
        }
      } catch (error) {
        if (error instanceof SuppressNotAllowedError) {
          await dropTemporary(temporaryIds);
          return NextResponse.json({ error: "Funde als Fehlalarm bestätigen darf nur ein Firmen-Admin.", code: "suppress_forbidden" }, { status: 403 });
        }
        await dropTemporary(temporaryIds);
        throw error;
      }
    }
    if (problems.length > 0) {
      await dropTemporary(temporaryIds);
      return NextResponse.json({ error: "Nicht alle Dateien konnten angenommen werden. Es wurde nichts gestartet.", code: "files_rejected", files: problems }, { status: 422 });
    }
    input = { ...meta.data, documentIds: [...temporaryIds, ...storedParsed.data] };
  } else {
    const parsed = startSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || (!parsed.data.documentId && !parsed.data.documentIds)) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    input = parsed.data;
  }

  try {
    const { jobId } = await startInternalCourse({ organizationId, userId, ...input });
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (error) {
    await dropTemporary(temporaryIds);
    if (error instanceof DocumentUnavailableError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof AiAccessUnavailableError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof DuplicateCourseGenerationJobError) {
      return NextResponse.json({ error: "Für diesen Titel läuft schon ein Auftrag." }, { status: 409 });
    }
    if (error instanceof TooManyActiveJobsError) {
      return NextResponse.json({ error: "Es laufen schon zwei Aufträge. Bitte warten, bis einer fertig ist." }, { status: 409 });
    }
    throw error;
  }
}

/** Löscht temporäre Dateien, die zu keinem gestarteten Auftrag gehören. */
async function dropTemporary(ids: string[]) {
  if (ids.length === 0) return;
  await getDb().delete(companyDocuments).where(inArray(companyDocuments.id, ids)).catch((e) => console.error("Temporäre Dateien löschen fehlgeschlagen:", e));
}
