import { NextResponse } from "next/server";
import { checkOnboardingRateLimit } from "@/lib/server/auth-rate-limit";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { AiAccessUnavailableError } from "@/lib/server/internal-courses/ai-client";
import { listCheatSheetStatus, NotOwnedError, NothingToDoError, RunAlreadyActiveError, startCheatSheetBackfill } from "@/lib/server/internal-courses/cheat-sheets";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stand der Merkzettel eines internen Lernpfads der eigenen Firma (Zahlen, nie Inhalte) und des letzten Laufs. */
export async function GET(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireCompanyApi(["company_admin", "mentor"]);
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!UUID.test(certId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const status = (await listCheatSheetStatus(guard.membership.organizationId)).find((s) => s.certificationId === certId);
  return status ? NextResponse.json(status, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * Erzeugt Merkzettel für Lektionen ohne Merkzettel mit dem KI-Zugang der Firma (Mentor, Firmen-Admin). Der Lauf geht im
 * Hintergrund weiter; vorhandene Merkzettel bleiben unverändert.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireCompanyApi(["company_admin", "mentor"]);
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!UUID.test(certId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = checkOnboardingRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zu viele Aktionen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  try {
    const started = await startCheatSheetBackfill({ organizationId: guard.membership.organizationId, userId: guard.membership.userId, certificationId: certId });
    return NextResponse.json(started, { status: 202 });
  } catch (error) {
    if (error instanceof NotOwnedError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof AiAccessUnavailableError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof RunAlreadyActiveError) return NextResponse.json({ error: "Für diesen Lernpfad läuft schon eine Erzeugung." }, { status: 409 });
    if (error instanceof NothingToDoError) return NextResponse.json({ error: "Alle Lektionen dieses Lernpfads haben schon einen Merkzettel." }, { status: 409 });
    throw error;
  }
}
