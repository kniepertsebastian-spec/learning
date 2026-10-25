import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { abandonCourse, isAssignedCourse, resumeCourse } from "@/lib/server/dashboard/abandon";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

type Params = { params: Promise<{ certId: string }> };

/** Kurs abbrechen: verschwindet aus dem Dashboard, Fortschritt bleibt. Von der Firma zugewiesene Kurse sind ausgenommen. */
export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = idSchema.safeParse((await params).certId);
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  if (await isCertificationHidden(user.id, parsed.data)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (await isAssignedCourse(user.id, parsed.data)) {
    return NextResponse.json({ error: "Von deiner Firma zugewiesene Kurse lassen sich nicht abbrechen." }, { status: 409 });
  }
  await abandonCourse(user.id, parsed.data);
  return new NextResponse(null, { status: 204 });
}

/** Kurs wieder aufnehmen. */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = idSchema.safeParse((await params).certId);
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  await resumeCourse(user.id, parsed.data);
  return new NextResponse(null, { status: 204 });
}
