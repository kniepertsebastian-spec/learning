import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { setCategories, CategoryError, CategoryNotFoundError } from "@/lib/server/catalog/categories";

export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ categoryIds: z.array(z.string().uuid()).max(12) }),
  z.object({ categoryId: z.string().uuid().nullable() }),
]);

/** Kurs Kursgruppen zuordnen: `categoryIds` (erste = Hauptgruppe, leer = Nicht zugeordnet) oder einzelne `categoryId`. Antwort: vorherige Gruppen für „Rückgängig“. */
export async function PUT(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = schema.parse(await request.json());
    const categoryIds = "categoryIds" in body ? body.categoryIds : body.categoryId ? [body.categoryId] : [];
    const { previous } = await setCategories({ certificationId: certId, categoryIds, actorUserId: guard.user.id });
    return NextResponse.json({ previous });
  } catch (error) {
    if (error instanceof CategoryNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof CategoryError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
