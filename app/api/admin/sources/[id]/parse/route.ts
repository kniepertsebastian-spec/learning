import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { extractSourceContent, publicExtractionMessage, SourceNotFoundError } from "@/lib/server/admin/source-extraction";
import { getCertificationSource } from "@/lib/server/admin/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/sources/:id/parse - R1.1: seitenweise Textextraktion für
 * eine bereits hochgeladene Quelle starten. Läuft synchron in diesem Request
 * (reine PDF-Textextraktion, kein KI-Aufruf, typischerweise Sekunden) statt
 * über einen Hintergrundjob wie die Content-Generierung (R0.3) - das
 * lohnt sich erst, sobald R1.2 die (langsamere, kostenpflichtige)
 * strukturierte KI-Extraktion ergänzt.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    await extractSourceContent(id);
  } catch (error) {
    if (error instanceof SourceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    // Die Einzelheiten stehen im Server-Log (extractSourceContent); der Client bekommt nur die freigegebene Meldung.
    const source = await getCertificationSource(id);
    return NextResponse.json({ error: publicExtractionMessage(error), source }, { status: 502 });
  }

  const source = await getCertificationSource(id);
  return NextResponse.json({ source });
}
