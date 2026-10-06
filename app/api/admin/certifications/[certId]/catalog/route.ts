import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { CourseNotFoundError, InvalidApprovalError, setCatalogStatus } from "@/lib/server/admin/course-requests";
import { requireAdminApi } from "@/lib/server/auth-guards";

export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(["draft", "in_review", "approved"]),
  approvedByName: z.string().max(120).nullable().optional(),
});

/** Betreiber: Prüfstatus eines Lernpfads. „approved“ verlangt den Namen der prüfenden Person. */
export async function PATCH(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    await setCatalogStatus({ certificationId: certId, status: body.status, approvedByName: body.approvedByName, actorUserId: guard.user.id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CourseNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof InvalidApprovalError) return NextResponse.json({ error: "Für die Freigabe wird der Name der prüfenden Person gebraucht." }, { status: 400 });
    throw error;
  }
}
