import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { CategoryError, CategoryNotFoundError, renameCategory } from "@/lib/server/catalog/categories";

export const dynamic = "force-dynamic";

const schema = z.object({ name: z.object({ de: z.string(), en: z.string() }) });

/** Kursgruppe umbenennen. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = schema.parse(await request.json());
    await renameCategory({ id, name: body.name, actorUserId: guard.user.id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CategoryNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof CategoryError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
