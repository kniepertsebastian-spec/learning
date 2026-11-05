import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/server/admin/rate-limit";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";
import { isPushConfigured } from "@/lib/server/push/config";
import { isAllowedPushEndpoint } from "@/lib/server/push/endpoint";
import { removeSubscription, saveSubscription } from "@/lib/server/push/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const subscribeSchema = z.object({
  endpoint: z.string().min(10).max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().min(10).max(1000) });

/** POST /api/push/subscribe - Gerät für Push anmelden (erst nach dem Opt-in der Person in den Einstellungen). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ error: "Push ist nicht eingerichtet." }, { status: 503 });
  if (!checkRateLimit("push-subscribe", user.id, 3_600_000, 30).allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isAllowedPushEndpoint(parsed.data.endpoint)) return NextResponse.json({ error: "Ungültiges Abo." }, { status: 400 });
  await saveSubscription(user.id, {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    authKey: parsed.data.keys.auth,
    locale: await getServerLocale(),
    userAgent: request.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** DELETE /api/push/subscribe - Gerät abmelden (Ausschalten oder Abmelden). Ohne eingerichtetes Push trotzdem erlaubt, damit Reste verschwinden. */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  await removeSubscription(user.id, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
