import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { CertNotFoundError, setVoucherRedeemed } from "@/lib/server/certificates/person";

export const dynamic = "force-dynamic";
const schema = z.object({ redeemed: z.boolean() });

/** Die zugewiesene Person markiert ihren Gutschein als eingelöst. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = schema.parse(await request.json());
    await setVoucherRedeemed(user.id, id, body.redeemed);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CertNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
