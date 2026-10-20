import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getProfile, saveProfile } from "@/lib/server/profile/service";

export const dynamic = "force-dynamic";

/** Eigenes berufliches Profil mit Skills (nur die eigene Person). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getProfile(user.id));
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await saveProfile(user.id, await request.json());
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
    throw error;
  }
}
