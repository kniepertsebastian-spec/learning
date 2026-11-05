import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { vapidConfig } from "@/lib/server/push/config";
import { countSubscriptions, getPushPreferences, savePushPreferences } from "@/lib/server/push/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z
  .object({ examReminders: z.boolean(), reviewsDue: z.boolean(), streakRisk: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0);

/** GET /api/push/preferences - Stand für die Einstellungen: ist Push eingerichtet, der öffentliche Schlüssel, die Wünsche, die Zahl der Geräte. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = vapidConfig();
  const [prefs, devices] = await Promise.all([getPushPreferences(user.id), countSubscriptions(user.id)]);
  return NextResponse.json({ configured: config !== null, publicKey: config?.publicKey ?? null, prefs, devices }, { headers: { "Cache-Control": "private, no-store" } });
}

/** PUT /api/push/preferences - einzelne Erinnerungsarten ein- oder ausschalten (gilt für alle Geräte). */
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  return NextResponse.json({ prefs: await savePushPreferences(user.id, parsed.data) });
}
