import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { ApprovalInvalidError, ApprovalNotFoundError, markEditorial } from "@/lib/server/approvals/service";
import { requireAdminApi } from "@/lib/server/auth-guards";

export const dynamic = "force-dynamic";

const schema = z.object({ note: z.string().max(500) });

/** Betreiber: Änderungen seit der Prüfung als redaktionell (Tippfehler, Formatierung) übernehmen; Notiz Pflicht, wird protokolliert. */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = schema.parse(await request.json());
    const entry = await markEditorial({ certificationId: certId, adminUserId: guard.user.id, note: body.note });
    return NextResponse.json({ versionLabel: entry.versionLabel }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    if (error instanceof ApprovalNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof ApprovalInvalidError) return NextResponse.json({ error: "Nur mit einer Notiz (mindestens 3 Zeichen), einer vorhandenen Freigabe und tatsächlichen Änderungen möglich." }, { status: 400 });
    throw error;
  }
}
