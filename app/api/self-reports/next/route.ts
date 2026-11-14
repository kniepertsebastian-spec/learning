import { NextResponse } from "next/server";
import { z } from "zod";
import { isCertificationHidden, isSectionHidden } from "@/lib/server/catalog/access";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { nextSelfReportQuestion } from "@/lib/server/self-reports/ask";

export const dynamic = "force-dynamic";

const querySchema = z.discriminatedUnion("context", [
  z.object({ context: z.literal("lesson"), refId: z.string().uuid() }),
  z.object({ context: z.literal("course"), refId: z.string().uuid() }),
]);

/**
 * Welche freiwillige Frage ist jetzt dran (Aufgabe 18)? `{ question: null }`, wenn keine: Flag aus, Art abgeschaltet oder pausiert, zu
 * kurz nach der letzten Frage. Der Check-in (5.6) fragt der Server beim Aufbau der Kursseite, nicht über diese Route.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ context: params.get("context"), refId: params.get("refId") });
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const { context, refId } = parsed.data;
  if (context === "lesson" ? await isSectionHidden(user.id, refId) : await isCertificationHidden(user.id, refId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const question = await nextSelfReportQuestion(user.id, context === "lesson" ? { context, sectionId: refId } : { context, certificationId: refId });
  return NextResponse.json({ question }, { headers: { "Cache-Control": "no-store" } });
}
