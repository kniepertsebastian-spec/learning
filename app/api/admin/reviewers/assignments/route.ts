import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { assignReviewer, NotAGeneralCourseError, NotAReviewerError, unassignReviewer } from "@/lib/server/reviewers/service";

export const dynamic = "force-dynamic";

const schema = z.object({ certificationId: z.string().uuid(), userId: z.string().uuid() });

/** Betreiber: Prüfer einem allgemeinen Kurs zuweisen. */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const body = schema.parse(await request.json());
    await assignReviewer({ ...body, assignedByUserId: guard.user.id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    if (error instanceof NotAGeneralCourseError) return NextResponse.json({ error: "Prüfer lassen sich nur allgemeinen Kursen zuweisen, nie internen Lernpfaden einer Firma." }, { status: 400 });
    if (error instanceof NotAReviewerError) return NextResponse.json({ error: "Die Person hat keine Prüfer-Rolle." }, { status: 400 });
    throw error;
  }
}

/** Betreiber: Zuweisung aufheben. */
export async function DELETE(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const body = schema.parse(await request.json());
    return (await unassignReviewer({ ...body, actorUserId: guard.user.id })) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
