import { NextResponse } from "next/server";
import { exportAccountData } from "@/lib/server/account/export";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { checkAccountExportRateLimit } from "@/lib/server/auth-rate-limit";

export const dynamic = "force-dynamic";

/** Alle persönlichen Daten des angemeldeten Nutzers als JSON-Download. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = checkAccountExportRateLimit(user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Exporte. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const data = await exportAccountData(user.id);
  if (!data) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const day = data.exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="learning-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
