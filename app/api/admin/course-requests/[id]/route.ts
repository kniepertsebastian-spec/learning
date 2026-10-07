import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { SETTABLE_REQUEST_STATUSES } from "@/lib/course-requests";
import { InvalidStatusChangeError, RequestNotFoundError, setRequestStatus } from "@/lib/server/admin/course-requests";
import { requireAdminApi } from "@/lib/server/auth-guards";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(SETTABLE_REQUEST_STATUSES as unknown as [string, ...string[]]),
  note: z.string().max(500).nullable().optional(),
});

/** Betreiber: Stand und Hinweis einer Anfrage setzen (nicht „freigegeben“, dafür gibt es /release). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    await setRequestStatus({ requestId: id, status: body.status as never, note: body.note ?? null, actorUserId: guard.user.id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof RequestNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof InvalidStatusChangeError) {
      return NextResponse.json({ error: "Diese Statusänderung ist nicht möglich (freigegeben, zurückgezogen und entzogen sind endgültig, Ablehnung braucht eine Begründung)." }, { status: 409 });
    }
    throw error;
  }
}
