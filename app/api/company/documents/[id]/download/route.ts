import { NextResponse } from "next/server";
import { z } from "zod";
import { DOCUMENT_ROLES } from "@/lib/server/company/access";
import { getCompanyDocumentFile } from "@/lib/server/company/documents";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Lädt das Original eines Firmendokuments der eigenen Organisation herunter (nie zur Anzeige im Browser). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(DOCUMENT_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const file = await getCompanyDocumentFile(guard.membership.organizationId, id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const asciiName = file.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Content-Length": String(file.data.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "no-store",
    },
  });
}
