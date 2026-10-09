import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { CertNotFoundError, revealVoucherCode } from "@/lib/server/certificates/person";

export const dynamic = "force-dynamic";

/** Gutscheincode – nur für die zugewiesene Person, nie für die Firma oder andere. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const code = await revealVoucherCode(user.id, id);
    return NextResponse.json({ code }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CertNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
