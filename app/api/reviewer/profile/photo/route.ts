import { NextResponse } from "next/server";
import { checkDocumentImageRateLimit } from "@/lib/server/auth-rate-limit";
import { BodyTooLargeError, readFormDataCapped } from "@/lib/server/http/capped-body";
import { requireReviewerUserApi } from "@/lib/server/reviewers/guard";
import { deletePhoto, getOwnPhoto, MAX_PHOTO_BYTES, savePhoto } from "@/lib/server/reviewers/photo-service";
import { profileErrorResponse } from "@/lib/server/reviewers/profile-http";
import { getOwnProfile } from "@/lib/server/reviewers/profile-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Das eigene Foto (auch ohne Veröffentlichung, für die Vorschau). */
export async function GET() {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  const photo = await getOwnPhoto(guard.user.id);
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), { headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

/** Foto hochladen oder ersetzen (multipart/form-data, Feld „file“; PNG, JPEG oder WebP, höchstens 2 MB). */
export async function POST(request: Request) {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  const limit = checkDocumentImageRateLimit(guard.user.id);
  if (!limit.allowed) return NextResponse.json({ error: "Zu viele Uploads. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  // Mit Obergrenze lesen, auch wenn der Body in Stücken ohne Content-Length kommt.
  let form: FormData;
  try {
    form = await readFormDataCapped(request, MAX_PHOTO_BYTES + 512 * 1024);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return NextResponse.json({ error: "Das Foto ist zu groß." }, { status: 413 });
    return NextResponse.json({ error: "Ungültige Anfrage (multipart/form-data erwartet)." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Es fehlt die Datei (Feld \"file\")." }, { status: 400 });
  try {
    await savePhoto(guard.user.id, { filename: file.name, mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json(await getOwnProfile(guard.user.id), { status: 201 });
  } catch (error) {
    return profileErrorResponse(error);
  }
}

export async function DELETE() {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  await deletePhoto(guard.user.id);
  return NextResponse.json(await getOwnProfile(guard.user.id));
}
