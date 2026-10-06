import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkCourseRequestRateLimit } from "@/lib/server/auth-rate-limit";
import { REQUEST_ROLES } from "@/lib/server/company/access";
import {
  AlreadyReleasedError,
  createCourseRequest,
  DuplicateRequestError,
  InvalidRequestError,
  listCourseRequests,
  listRequestableCourses,
  MAX_WISH_DESCRIPTION,
  MAX_WISH_TITLE,
  UnknownCourseError,
} from "@/lib/server/company/course-requests";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  certificationId: z.string().uuid().nullable().optional(),
  wishTitle: z.string().max(MAX_WISH_TITLE).nullable().optional(),
  wishDescription: z.string().max(MAX_WISH_DESCRIPTION).nullable().optional(),
});

/** Eigene Anfragen mit Status und Verlauf, dazu der Katalog, aus dem sich anfragen lässt. */
export async function GET() {
  const guard = await requireCompanyApi(REQUEST_ROLES);
  if (!guard.ok) return guard.response;
  const orgId = guard.membership.organizationId;
  const [requests, catalog] = await Promise.all([listCourseRequests(orgId), listRequestableCourses(orgId)]);
  return NextResponse.json({ requests, catalog }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Fragt einen allgemeinen Lernpfad an: entweder `certificationId` aus dem Katalog oder ein freier Wunsch
 * (`wishTitle`, optional `wishDescription`), nie beides. Die Organisation kommt aus der Mitgliedschaft.
 */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(REQUEST_ROLES);
  if (!guard.ok) return guard.response;

  const limit = checkCourseRequestRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }
    throw error;
  }

  try {
    const created = await createCourseRequest({
      organizationId: guard.membership.organizationId,
      requestedByUserId: guard.membership.userId,
      certificationId: body.certificationId,
      wishTitle: body.wishTitle,
      wishDescription: body.wishDescription,
    });
    return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      return NextResponse.json({ error: "Bitte entweder einen Lernpfad wählen oder den Wunsch beschreiben (Titel mindestens 3 Zeichen)." }, { status: 400 });
    }
    if (error instanceof UnknownCourseError) return NextResponse.json({ error: "Lernpfad nicht gefunden." }, { status: 404 });
    if (error instanceof AlreadyReleasedError) return NextResponse.json({ error: "Dieser Lernpfad ist für deine Firma schon freigegeben." }, { status: 409 });
    if (error instanceof DuplicateRequestError) return NextResponse.json({ error: "Für diesen Lernpfad läuft schon eine Anfrage." }, { status: 409 });
    console.error("Error creating course request:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
