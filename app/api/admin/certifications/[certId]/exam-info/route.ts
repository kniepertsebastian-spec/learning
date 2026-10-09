import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { eq, and } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { certifications, EXAM_DELIVERY_MODES, EXAM_PROVIDERS } from "@/lib/server/db/schema";

export const dynamic = "force-dynamic";

const httpsUrl = z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), "nur http(s)");
const schema = z.object({
  examProvider: z.enum(EXAM_PROVIDERS).nullable(),
  deliveryModes: z.array(z.enum(EXAM_DELIVERY_MODES)).max(2),
  bookingUrl: httpsUrl.nullable(),
  testCenterUrl: httpsUrl.nullable(),
  validityMonths: z.number().int().min(1).max(240).nullable(),
  successorNote: z.string().trim().max(500).nullable(),
});

/** Betreiber pflegt am allgemeinen Kurs Prüfungsanbieter, Prüfungsformen, Buchungslinks, Gültigkeit und Hinweis auf eine Nachfolgeversion. */
export async function PATCH(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = schema.parse(await request.json());
    const [row] = await getDb()
      .update(certifications)
      .set({ examProvider: body.examProvider, deliveryModes: body.deliveryModes, bookingUrl: body.bookingUrl, testCenterUrl: body.testCenterUrl, validityMonths: body.validityMonths, successorNote: body.successorNote || null })
      .where(and(eq(certifications.id, certId), eq(certifications.kind, "general")))
      .returning({ id: certifications.id });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await recordAuditEvent({ actorUserId: guard.user.id, action: "certification.exam_info", targetType: "certification", targetId: row.id, metadata: { provider: body.examProvider } }).catch(() => {});
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
