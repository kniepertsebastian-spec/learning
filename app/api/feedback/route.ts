import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { FEEDBACK_MAX_LENGTH, FeedbackInvalidError, FeedbackRateLimitError, submitFeedback } from "@/lib/server/feedback/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  certificationId: z.string().uuid(),
  domainId: z.string().uuid().nullish(),
  sectionId: z.string().uuid().nullish(),
  category: z.enum(["bug", "typo", "content", "other"]),
  message: z.string().max(FEEDBACK_MAX_LENGTH),
});

/** POST /api/feedback - „Problem melden / Feedback“ mit Kontext (Kurs, Kapitel, Lektion). Jede angemeldete Person darf melden. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const { certificationId } = parsed.data;
  if (await isCertificationHidden(session.user.id, certificationId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [cert] = await getDb().select({ kind: certifications.kind }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
  if (!cert) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Interne Lernpfade gehören der Firma: ihre Inhalte gehen nie an den Betreiber (auch nicht als Rückmeldung).
  if (cert.kind !== "general") return NextResponse.json({ error: "Rückmeldungen zu internen Lernpfaden gehen an deine Firma, nicht an den Betreiber." }, { status: 422 });
  try {
    const { id } = await submitFeedback({ userId: session.user.id, ...parsed.data });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof FeedbackInvalidError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof FeedbackRateLimitError) return NextResponse.json({ error: "Du hast heute schon viele Meldungen geschickt. Danke! Bitte versuche es morgen wieder." }, { status: 429 });
    throw error;
  }
}
