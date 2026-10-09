import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { assignVoucher, removeVoucher, VoucherNotFoundError } from "@/lib/server/company/certificates";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";
const schema = z.object({ assignedUserId: z.string().uuid().nullable() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = schema.parse(await request.json());
    await assignVoucher({ organizationId: guard.membership.organizationId, actorUserId: guard.membership.userId, id, assignedUserId: body.assignedUserId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof VoucherNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await removeVoucher({ organizationId: guard.membership.organizationId, actorUserId: guard.membership.userId, id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof VoucherNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
