import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { revokeIssuedProfile } from "@/lib/server/profile-export/service";

export const dynamic = "force-dynamic";

/** DELETE: eigenes PDF widerrufen (die Prüfseite zeigt es danach als widerrufen). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return (await revokeIssuedProfile(user.id, id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
