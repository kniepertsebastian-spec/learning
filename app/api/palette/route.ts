import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/admin/rate-limit";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";
import { searchPalette } from "@/lib/server/palette/search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/palette?q=… - Suche der Command-Palette (⌘K): Kurse, Abschnitte und Befehle aus Merkzetteln, nur Sichtbares. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Tippen löst viele Anfragen aus; mehr als 90 je Minute sind kein Mensch.
  const limit = checkRateLimit("palette", user.id, 60_000, 90);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const hits = await searchPalette({ id: user.id, role: user.role }, q, await getServerLocale());
  return NextResponse.json({ hits }, { headers: { "Cache-Control": "private, no-store" } });
}
