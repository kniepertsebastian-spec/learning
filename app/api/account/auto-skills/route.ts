import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { setAutoSkills } from "@/lib/server/profile/service";

export const dynamic = "force-dynamic";

/** Einstellung: Skills aus bestandenen Kursen und Zertifikaten automatisch ins Profil übernehmen (beim Einschalten mit Nachtrag). */
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = z.object({ enabled: z.boolean() }).parse(await request.json());
    return NextResponse.json(await setAutoSkills(user.id, body.enabled));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
