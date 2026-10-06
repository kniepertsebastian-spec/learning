import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  CourseNotFoundError,
  CourseNotReleasableError,
  InvalidStatusChangeError,
  NoCourseError,
  releaseRequest,
  RequestNotFoundError,
} from "@/lib/server/admin/course-requests";
import { requireAdminApi } from "@/lib/server/auth-guards";

export const dynamic = "force-dynamic";

const releaseSchema = z.object({
  certificationId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

/** Betreiber: gibt den Lernpfad der Anfrage für die Firma frei (optional mit angegebenem Lernpfad). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: z.infer<typeof releaseSchema>;
  try {
    const raw = await request.text();
    body = releaseSchema.parse(raw ? JSON.parse(raw) : {});
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    const result = await releaseRequest({ requestId: id, certificationId: body.certificationId, note: body.note, actorUserId: guard.user.id });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RequestNotFoundError || error instanceof CourseNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof NoCourseError) return NextResponse.json({ error: "Zu dieser Anfrage gibt es noch keinen Lernpfad. Bitte einen angeben." }, { status: 400 });
    if (error instanceof CourseNotReleasableError) {
      return NextResponse.json({ error: "Der Lernpfad ist nicht freigegeben (fachliche Prüfung fehlt) oder kein allgemeiner Lernpfad." }, { status: 409 });
    }
    if (error instanceof InvalidStatusChangeError) return NextResponse.json({ error: "Die Anfrage ist schon freigegeben." }, { status: 409 });
    throw error;
  }
}
