import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db/client";

/**
 * R6 (roadmap.md): Readiness-Endpunkt, getrennt von /api/health.
 * /api/health prüft nur, dass der Prozess läuft (für den docker-compose-
 * Healthcheck, der den Start-Zeitpunkt für cloudflared gated - siehe
 * docker-compose.yml). /api/ready prüft zusätzlich die tatsächliche
 * Abhängigkeit (DB erreichbar) und antwortet mit 503, wenn nicht - relevant
 * z. B. hinter einem Load Balancer, der Traffic erst nach echter
 * Betriebsbereitschaft zuweisen soll, nicht nur nach Prozessstart.
 */
// Kein Pfadparameter, der die Route implizit dynamisch macht (anders als
// z. B. app/api/progress/[certId]/route.ts) - ohne diesen Export würde
// Next.js versuchen, die Antwort statisch zu optimieren/cachen, siehe
// dasselbe Muster in app/api/admin/sources/route.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "not_ready", reason: "database unreachable" }, { status: 503 });
  }
}
