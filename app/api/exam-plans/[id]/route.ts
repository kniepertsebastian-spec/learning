import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { deletePlan, PlanNotFoundError, setPlanStatus } from "@/lib/server/exams/planner";

export const dynamic = "force-dynamic";

const schema = z.object({ status: z.enum(["planned", "passed", "failed", "cancelled"]) });

/** Ergebnis eintragen („bestanden“/„nicht bestanden“) oder den Plan absagen. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = schema.parse(await request.json());
    await setPlanStatus(user.id, id, body.status);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof PlanNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    await deletePlan(user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof PlanNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
