import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { EncryptionNotConfiguredError } from "@/lib/server/crypto/secret-box";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { addVoucher, VoucherError, VoucherNotFoundError } from "@/lib/server/company/certificates";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

const schema = z.object({
  certificationId: z.string().uuid(),
  assignedUserId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(200).default(""),
  code: z.string().max(200).nullable().optional(),
});

/** Prüfungsgutschein der Firma anlegen. Der Code wird verschlüsselt gespeichert und nie an die Firma zurückgegeben. */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  try {
    const body = schema.parse(await request.json());
    const id = await addVoucher({ organizationId: guard.membership.organizationId, actorUserId: guard.membership.userId, certificationId: body.certificationId, assignedUserId: body.assignedUserId ?? null, expiresAt: new Date(`${body.expiresAt}T23:59:59Z`), note: body.note, code: body.code ?? null });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof VoucherNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof EncryptionNotConfiguredError) return NextResponse.json({ error: "Für Gutscheincodes ist keine Verschlüsselung eingerichtet (APP_ENCRYPTION_KEY)." }, { status: 503 });
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof VoucherError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
