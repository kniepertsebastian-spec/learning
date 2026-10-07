import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { EntitlementNotFoundError, listEntitlements, revokeEntitlement } from "@/lib/server/admin/course-requests";
import { requireAdminApi } from "@/lib/server/auth-guards";

export const dynamic = "force-dynamic";

const revokeSchema = z.object({
  organizationId: z.string().uuid(),
  certificationId: z.string().uuid(),
  note: z.string().max(500).nullable().optional(),
});

/** Betreiber: erteilte Firmenfreigaben allgemeiner Lernpfade. */
export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  return NextResponse.json({ entitlements: await listEntitlements() }, { headers: { "Cache-Control": "no-store" } });
}

/** Betreiber: entzieht einer Firma die Freigabe eines Lernpfads (bestehende Zuweisungen bleiben). */
export async function DELETE(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  let body: z.infer<typeof revokeSchema>;
  try {
    body = revokeSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    await revokeEntitlement({ ...body, actorUserId: guard.user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EntitlementNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
