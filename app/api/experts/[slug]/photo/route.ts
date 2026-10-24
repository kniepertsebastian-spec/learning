import { NextResponse } from "next/server";
import { getPublicPhoto } from "@/lib/server/reviewers/photo-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Öffentliches Foto: nur bei veröffentlichtem Profil mit Einwilligung; sonst 404 (kein Hinweis, ob es ein Foto gibt). */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const photo = await getPublicPhoto(slug);
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Die Adresse trägt die Version; ein Rückzug wirkt trotzdem sofort, weil jede Anfrage neu prüft (kein Zwischenspeicher im Netz).
  return new NextResponse(new Uint8Array(photo.data), { headers: { "Content-Type": photo.mimeType, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" } });
}
