import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { resolveContentTarget } from "@/lib/server/catalog/access";
import { ensureQuestionRationales } from "@/lib/server/questions/rationales";
import { withAiCost } from "@/lib/server/admin/ai-ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/questions/:id/rationales - „Warum die anderen nicht passen“ bei Bedarf (UI U4). Die Kursgenerierung erzeugt
 * die Begründungen nicht mehr vorab; das Feedback-Panel fragt sie an, wenn ein Lerner eine Frage falsch beantwortet und
 * noch keine vorliegen. Erzeugt wird pro Frage höchstens einmal, danach kommen sie aus der Datenbank.
 * Antwort: `{ options: [{ text, rationale }] }` in der gespeicherten Reihenfolge, oder `{ options: null }`, wenn keine
 * Begründungen verfügbar sind (z. B. kein KI-Zugang) - kein Fehler, die Oberfläche zeigt dann einfach keine.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const target = await resolveContentTarget(session.user.id, "question", id);
  if (target === "missing" || target === "hidden") return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    return NextResponse.json({ options: await withAiCost({ source: "other", detail: "rationales" }, () => ensureQuestionRationales(id)) });
  } catch (error) {
    console.error("Begründungen konnten nicht erzeugt werden:", (error as Error).message);
    return NextResponse.json({ options: null });
  }
}
