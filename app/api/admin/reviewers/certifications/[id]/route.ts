import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { setCertificationVerified } from "@/lib/server/reviewers/profile-service";

export const dynamic = "force-dynamic";

/** Betreiber: Nachweis-Link eines Prüfer-Zertifikats als geprüft markieren oder die Prüfung zurücknehmen. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { verified } = z.object({ verified: z.boolean() }).parse(await request.json());
    return (await setCertificationVerified(guard.user.id, id, verified)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
    throw error;
  }
}
