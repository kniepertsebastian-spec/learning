import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireReviewerApi } from "@/lib/server/reviewers/guard";
import { addReviewerComment, InvalidCommentError, TargetNotInCourseError } from "@/lib/server/reviewers/service";

export const dynamic = "force-dynamic";

const schema = z.object({ targetType: z.enum(["section", "question"]), targetId: z.string().uuid(), kind: z.enum(["comment", "faulty"]), text: z.string().max(2100) });

/** Prüfer: Kommentar oder „fehlerhaft“-Meldung zu einem Abschnitt oder einer Frage des zugewiesenen Kurses. */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await requireReviewerApi(certId);
  if (!guard.ok) return guard.response;
  try {
    const body = schema.parse(await request.json());
    const row = await addReviewerComment({ certificationId: certId, reviewerUserId: guard.user.id, ...body });
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof InvalidCommentError) return NextResponse.json({ error: "Bitte einen Text mit 3 bis 2000 Zeichen angeben." }, { status: 400 });
    if (error instanceof TargetNotInCourseError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
