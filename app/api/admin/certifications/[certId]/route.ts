import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CertificationNotFoundError,
  DataAttachedError,
  deleteCertification,
  GenerationRunningError,
  getDeleteImpact,
  InternalCertificationError,
  SlugMismatchError,
} from "@/lib/server/admin/delete-certification";
import { requireAdminApi } from "@/lib/server/auth-guards";

export const dynamic = "force-dynamic";

const deleteSchema = z.object({ confirmSlug: z.string().min(1).max(200), acknowledgeData: z.boolean().optional() });

/** Betreiber: was hängt an diesem Kurs (Lernende, Zuweisungen, Freischaltungen, Pflichtregeln)? */
export async function GET(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ impact: await getDeleteImpact(certId) }, { headers: { "Cache-Control": "no-store" } });
}

/** Betreiber: löscht einen allgemeinen Kurs. Der Slug muss bestätigt werden; hängen Daten dran, zusätzlich `acknowledgeData`. */
export async function DELETE(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  try {
    const impact = await deleteCertification({ certificationId: certId, actorUserId: guard.user.id, ...body.data });
    return NextResponse.json({ deleted: true, impact });
  } catch (error) {
    if (error instanceof CertificationNotFoundError || error instanceof InternalCertificationError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof SlugMismatchError) return NextResponse.json({ error: "Der eingegebene Kurzname stimmt nicht." }, { status: 400 });
    if (error instanceof GenerationRunningError) return NextResponse.json({ error: "Es läuft gerade eine Inhaltsgenerierung für diesen Kurs." }, { status: 409 });
    if (error instanceof DataAttachedError) return NextResponse.json({ error: "Es hängen Lerndaten oder Zuweisungen am Kurs. Bitte ausdrücklich bestätigen.", code: "data_attached", impact: error.impact }, { status: 409 });
    throw error;
  }
}
