import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { CertNotFoundError, deleteOwnCertificate, setCertificateShared } from "@/lib/server/certificates/person";

export const dynamic = "force-dynamic";
const schema = z.object({ sharedWithCompany: z.boolean() });

/** Für die Firma freigeben oder zurücknehmen (nur eigene Zertifikate). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = schema.parse(await request.json());
    await setCertificateShared(user.id, id, body.sharedWithCompany);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CertNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await deleteOwnCertificate(user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CertNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
