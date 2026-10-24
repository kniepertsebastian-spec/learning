import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { setQualification } from "@/lib/server/reviewers/probe-service";

export const dynamic = "force-dynamic";

/** Betreiber: eine Person mit Prüfer-Rolle für Freigaben und Profil-Veröffentlichung freischalten oder die Freischaltung zurücknehmen. */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const { userId, granted } = z.object({ userId: z.string().uuid(), granted: z.boolean() }).parse(await request.json());
    return (await setQualification(guard.user.id, userId, granted)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
    throw error;
  }
}
