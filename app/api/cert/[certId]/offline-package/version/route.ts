import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { getOfflinePackageVersion } from "@/lib/server/offline/manifest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/cert/:certId/offline-package/version - R4.1: günstiger
 * Versionsabgleich ("Aktualisierungsdatum anzeigen" / Update-Prüfung), ohne
 * das gesamte Paket erneut herunterzuladen. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ certId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { certId } = await params;
  const version = await getOfflinePackageVersion(certId);
  if (version === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ version });
}
