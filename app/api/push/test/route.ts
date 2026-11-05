import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/admin/rate-limit";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { testPayload } from "@/lib/push/logic";
import { isPushConfigured } from "@/lib/server/push/config";
import { sendToUser } from "@/lib/server/push/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/push/test - Testnachricht an die eigenen Geräte, damit die Person sieht, dass es klappt. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ error: "Push ist nicht eingerichtet." }, { status: 503 });
  if (!checkRateLimit("push-test", user.id, 600_000, 5).allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const delivered = await sendToUser(user.id, (locale) => testPayload(locale));
  return NextResponse.json({ delivered });
}
