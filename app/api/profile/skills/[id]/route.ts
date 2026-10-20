import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { deleteSkill, SkillNotFoundError, updateSkill } from "@/lib/server/profile/service";

export const dynamic = "force-dynamic";

async function handle(params: Promise<{ id: string }>, fn: (userId: string, id: string) => Promise<void>) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await fn(user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof SkillNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
    throw error;
  }
}

/** Stufe bzw. Aktualität eines eigenen Eintrags ändern. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(params, async (userId, id) => updateSkill(userId, id, await request.json()));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(params, deleteSkill);
}
