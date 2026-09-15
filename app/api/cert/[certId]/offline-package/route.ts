import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { getOfflinePackage } from "@/lib/server/offline/manifest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/cert/:certId/offline-package - R4.1 (roadmap.md): "Für offline
 * speichern" - liefert das vollständige, versionierte Kurspaket. certId ist
 * hier die certifications.id (nicht der slug), passend zu den certId-Props,
 * die die Kursseite bereits clientseitig herumreicht. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ certId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { certId } = await params;
  const pkg = await getOfflinePackage(certId, session.user.id);
  if (!pkg) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = JSON.stringify(pkg);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
    },
  });
}
