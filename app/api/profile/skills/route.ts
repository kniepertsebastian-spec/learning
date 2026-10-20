import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { addSkill, SkillExistsError } from "@/lib/server/profile/service";

export const dynamic = "force-dynamic";

/** Skill oder Tool selbst eintragen. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = await addSkill(user.id, await request.json());
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof SkillExistsError) return NextResponse.json({ error: "Diesen Eintrag gibt es schon." }, { status: 409 });
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
    throw error;
  }
}
