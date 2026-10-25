import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { auth } from "@/lib/server/auth";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { PreAssessmentInvalidError, skipPreAssessment, submitPreAssessment } from "@/lib/server/pre-assessment/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.union([
  z.object({ skip: z.literal(true) }),
  z.object({ answers: z.array(z.object({ questionId: z.string().uuid(), selectedOptionId: z.string().uuid() })).min(1).max(10) }),
]);

/** POST /api/pre-assessment/:certId - Einstufungstest auswerten (`answers`) oder überspringen (`skip`). Einmalig je Person und Kurs. */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success || (await isCertificationHidden(session.user.id, certId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  if ("skip" in body) {
    await skipPreAssessment(session.user.id, certId);
    return new NextResponse(null, { status: 204 });
  }
  try {
    return NextResponse.json(await submitPreAssessment(session.user.id, certId, body.answers), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PreAssessmentInvalidError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
