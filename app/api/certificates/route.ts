import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { addOwnCertificate, CertError } from "@/lib/server/certificates/person";

export const dynamic = "force-dynamic";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  certificationId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(160),
  vendor: z.string().max(120).default(""),
  earnedAt: date,
  expiresAt: date.nullable().optional(),
  evidenceUrl: z.string().max(500).nullable().optional(),
});

/** Eigenes Zertifikat eintragen (nie für andere). Freigegeben für die Firma wird es nur über PATCH /api/certificates/[id]. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = schema.parse(await request.json());
    const id = await addOwnCertificate(user.id, { certificationId: b.certificationId ?? null, title: b.title, vendor: b.vendor, earnedAt: new Date(`${b.earnedAt}T00:00:00Z`), expiresAt: b.expiresAt ? new Date(`${b.expiresAt}T00:00:00Z`) : null, evidenceUrl: b.evidenceUrl || null });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof CertError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
