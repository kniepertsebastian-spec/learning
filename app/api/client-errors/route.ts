import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/admin/rate-limit";
import { clientIp } from "@/lib/server/auth-rate-limit";
import { BodyTooLargeError, readJsonCapped } from "@/lib/server/http/capped-body";
import { clientErrorSchema, MAX_CLIENT_ERROR_BODY_BYTES, recordClientError } from "@/lib/server/observability/client-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 20;
/** Obergrenze für alle zusammen: auch mit wechselnden IPs lässt sich das Log so nicht fluten. */
const MAX_TOTAL = 300;

/**
 * POST /api/client-errors - Fehlerseiten melden Fehler aus dem Browser (lib/server/observability/client-errors.ts). Ohne
 * Anmeldung, weil die globale Fehlerseite auch erscheint, wenn die Anmeldung selbst scheitert; dafür begrenzt (Größe,
 * Anzahl je IP und insgesamt), nur vom eigenen Ursprung, und der Inhalt wird vor dem Loggen bereinigt.
 */
export async function POST(request: Request) {
  // Browser senden Sec-Fetch-Site mit; fremde Seiten sollen hier nichts ins Log schreiben können.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const byIp = checkRateLimit("client-errors-ip", clientIp(request.headers), WINDOW_MS, MAX_PER_IP);
  if (!byIp.allowed) return new Response(null, { status: 429, headers: { "Retry-After": String(byIp.retryAfterSeconds) } });
  const total = checkRateLimit("client-errors-total", "all", WINDOW_MS, MAX_TOTAL);
  if (!total.allowed) return new Response(null, { status: 429, headers: { "Retry-After": String(total.retryAfterSeconds) } });

  let body: unknown;
  try {
    body = await readJsonCapped(request, MAX_CLIENT_ERROR_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return NextResponse.json({ error: "Zu groß." }, { status: 413 });
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = clientErrorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });

  recordClientError(parsed.data, request.headers.get("user-agent"));
  return new Response(null, { status: 204 });
}
