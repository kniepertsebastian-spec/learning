import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { startCourseTranslation } from "@/lib/server/course-translation/runner";

export const dynamic = "force-dynamic";

/**
 * Kurs in die zweite Sprache übersetzen (Knopf in der Admin-Kursübersicht). Läuft im Hintergrund; ein erneuter Aufruf
 * übersetzt nur, was noch fehlt. Nur allgemeine Kurse: interne gehören einer Firma, ihr Inhalt ist für den Betreiber tabu.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [cert] = await getDb().select({ kind: certifications.kind }).from(certifications).where(eq(certifications.id, certId)).limit(1);
  if (!cert || cert.kind !== "general") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await startCourseTranslation(certId);
  if (result === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result === "started") {
    await recordAuditEvent({ actorUserId: guard.user.id, action: "certification.translate", targetType: "certification", targetId: certId });
  }
  return NextResponse.json({ status: result }, { status: result === "started" ? 202 : 200 });
}
