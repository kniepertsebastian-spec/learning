import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { COURSE_CATEGORY_COLORS } from "@/lib/server/db/schema";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { CategoryError, createCategory, listCategories, reorderCategories } from "@/lib/server/catalog/categories";

export const dynamic = "force-dynamic";

const localized = z.object({ de: z.string(), en: z.string() });
const createSchema = z.object({ name: localized, color: z.enum(COURSE_CATEGORY_COLORS) });
const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });

export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  return NextResponse.json(await listCategories());
}

export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const body = createSchema.parse(await request.json());
    return NextResponse.json(await createCategory({ ...body, actorUserId: guard.user.id }), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof CategoryError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}

/** Reihenfolge der Gruppen speichern. */
export async function PUT(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const body = reorderSchema.parse(await request.json());
    await reorderCategories({ ids: body.ids, actorUserId: guard.user.id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof CategoryError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
