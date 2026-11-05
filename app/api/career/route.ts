import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { CareerLimitError, CareerProfileError, getCareerView, refreshCareerPaths } from "@/lib/server/career/service";
import { getServerLocale } from "@/lib/server/locale";
import { withAiCost } from "@/lib/server/admin/ai-ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Gespeicherte Karrierepfade mit aktuellem Kursstand und Gehalt. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getCareerView(user.id, await getServerLocale()));
}

/** Karrierepfade auf Abruf neu berechnen (KI, höchstens 5-mal am Tag). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locale = await getServerLocale();
  try {
    await withAiCost({ source: "other", detail: "career" }, () => refreshCareerPaths(user.id, locale));
  } catch (error) {
    if (error instanceof CareerProfileError) return NextResponse.json({ error: error.message }, { status: 422 });
    if (error instanceof CareerLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    console.error("[career] Berechnung fehlgeschlagen:", error);
    return NextResponse.json({ error: locale === "de" ? "Die Pfade konnten gerade nicht berechnet werden. Bitte später erneut versuchen." : "Paths could not be calculated right now. Please try again later." }, { status: 502 });
  }
  return NextResponse.json(await getCareerView(user.id, locale));
}
