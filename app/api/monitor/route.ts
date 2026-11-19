import { NextResponse } from "next/server";
import { formatMonitorReport, getMonitorReport, isMonitorAuthorized } from "@/lib/server/observability/monitor";

/**
 * R5: Kennzahlen für scripts/monitor.sh (Serverfehler, gescheiterte Kursgenerierungen, KI-Budget). Nur mit
 * `Authorization: Bearer $MONITOR_TOKEN`; ohne gesetztes Token antwortet der Endpunkt immer mit 404.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isMonitorAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const report = await getMonitorReport();
    // ?format=text: Zeilenformat für scripts/monitor.sh (ohne jq).
    if (new URL(request.url).searchParams.get("format") === "text") {
      return new Response(formatMonitorReport(report), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "monitor report unavailable" }, { status: 503 });
  }
}
