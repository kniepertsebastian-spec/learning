import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { auth } from "@/lib/server/auth";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { getDb } from "@/lib/server/db/client";
import { domains } from "@/lib/server/db/schema";
import { PlacementIncompleteError, PlacementNotFoundError, submitPlacement } from "@/lib/server/placement/service";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  answers: z
    .array(z.object({ questionId: z.string().uuid(), selectedOptionId: z.string().uuid(), confidence: z.enum(["guessed", "unsure", "sure"]) }))
    .min(1)
    .max(40),
});

/** POST /api/placement/:domainId - Einstiegstest eines Kapitels (Domain) auswerten; bei Bestehen werden Lektionen übersprungen. */
export async function POST(request: Request, { params }: { params: Promise<{ domainId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { domainId } = await params;
  if (!z.string().uuid().safeParse(domainId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  const [domain] = await getDb().select({ certificationId: domains.certificationId }).from(domains).where(eq(domains.id, domainId)).limit(1);
  if (!domain || (await isCertificationHidden(session.user.id, domain.certificationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(await submitPlacement(session.user.id, domainId, body.answers), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PlacementNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof PlacementIncompleteError) return NextResponse.json({ error: "Bitte alle Fragen beantworten." }, { status: 400 });
    throw error;
  }
}
