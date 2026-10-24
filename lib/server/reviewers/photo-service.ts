/**
 * Profilfoto eines Prüfers (roadmap_pruefer Phase 3, Foto). Ein Bild je Person, in der Datenbank. Öffentlich wird es nur bei
 * veröffentlichtem Profil UND Einwilligung für das Foto; der Rückzug des Profils löscht es (siehe `withdrawProfile`).
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { reviewerPhotos, reviewerProfiles } from "@/lib/server/db/schema";
import { inspectImage } from "@/lib/server/documents/images";
import { ProfileError } from "./profile-service";

/** Fotos bleiben klein: für ein Profilbild reichen 2 MB, auch von modernen Handys. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export type PhotoFile = { mimeType: string; data: Buffer; version: number };

export async function savePhoto(userId: string, file: { filename: string; mimeType: string; data: Buffer }, now = new Date()): Promise<void> {
  const [profile] = await getDb().select({ userId: reviewerProfiles.userId }).from(reviewerProfiles).where(eq(reviewerProfiles.userId, userId)).limit(1);
  if (!profile) throw new ProfileError("Lege zuerst dein Profil an.");
  if (file.data.byteLength > MAX_PHOTO_BYTES) throw new ProfileError(`Das Foto ist größer als ${MAX_PHOTO_BYTES / (1024 * 1024)} MB.`);
  const check = inspectImage(file);
  if (!check.ok) throw new ProfileError(check.message);
  await getDb()
    .insert(reviewerPhotos)
    .values({ userId, mimeType: check.mimeType, sizeBytes: file.data.byteLength, data: file.data, updatedAt: now })
    .onConflictDoUpdate({ target: reviewerPhotos.userId, set: { mimeType: check.mimeType, sizeBytes: file.data.byteLength, data: file.data, updatedAt: now } });
}

export async function deletePhoto(userId: string): Promise<boolean> {
  const rows = await getDb().delete(reviewerPhotos).where(eq(reviewerPhotos.userId, userId)).returning({ userId: reviewerPhotos.userId });
  return rows.length > 0;
}

/** Die Versionsnummer (für Adressen gegen Zwischenspeicher) oder null, wenn es kein Foto gibt. */
export async function photoVersion(userId: string): Promise<number | null> {
  const [row] = await getDb().select({ updatedAt: reviewerPhotos.updatedAt }).from(reviewerPhotos).where(eq(reviewerPhotos.userId, userId)).limit(1);
  return row ? row.updatedAt.getTime() : null;
}

/** Eigenes Foto, immer sichtbar für die Person selbst. */
export async function getOwnPhoto(userId: string): Promise<PhotoFile | null> {
  const [row] = await getDb().select().from(reviewerPhotos).where(eq(reviewerPhotos.userId, userId)).limit(1);
  return row ? { mimeType: row.mimeType, data: row.data, version: row.updatedAt.getTime() } : null;
}

/** Öffentliches Foto: nur bei veröffentlichtem Profil mit Einwilligung für Name UND Foto (wie die übrige öffentliche Sicht). */
export async function getPublicPhoto(slug: string): Promise<PhotoFile | null> {
  const [row] = await getDb()
    .select({ userId: reviewerProfiles.userId, published: reviewerProfiles.published, consent: reviewerProfiles.consent })
    .from(reviewerProfiles)
    .where(eq(reviewerProfiles.slug, slug))
    .limit(1);
  if (!row || !row.published || !row.consent.name || !row.consent.photo) return null;
  return getOwnPhoto(row.userId);
}
