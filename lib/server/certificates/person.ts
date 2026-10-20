import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, examVouchers, userCertificates, organizations } from "@/lib/server/db/schema";
import { decryptSecret, DecryptionFailedError } from "@/lib/server/crypto/secret-box";
import { expiryFrom } from "@/lib/certificates/logic";
import { recordCertified } from "@/lib/server/stats/completions";
import { addSkillFromCourse } from "@/lib/server/profile/service";

/** Eigene Zertifikate und zugewiesene Gutscheine (UI U9). Jede Abfrage filtert nach `userId`; die Firma kommt hier nicht vor. */
export class CertError extends Error {}
export class CertNotFoundError extends CertError {}

export interface CertInput {
  certificationId: string | null;
  title: string;
  vendor: string;
  earnedAt: Date;
  expiresAt: Date | null;
  evidenceUrl: string | null;
}

function validate(i: CertInput) {
  const title = i.title.trim();
  if (!title || title.length > 160 || i.vendor.length > 120) throw new CertError("Name 1–160 Zeichen.");
  if (i.expiresAt && i.expiresAt.getTime() < i.earnedAt.getTime()) throw new CertError("Gültig bis liegt vor dem Erwerb.");
  if (i.evidenceUrl && !/^https?:\/\/\S{1,480}$/i.test(i.evidenceUrl)) throw new CertError("Nachweis-Link muss mit http(s) beginnen.");
  return title;
}

export async function listOwnCertificates(userId: string) {
  return getDb().select().from(userCertificates).where(eq(userCertificates.userId, userId)).orderBy(desc(userCertificates.earnedAt));
}

export async function addOwnCertificate(userId: string, input: CertInput): Promise<string> {
  const title = validate(input);
  const [row] = await getDb().insert(userCertificates).values({ userId, certificationId: input.certificationId, title, vendor: input.vendor.trim(), earnedAt: input.earnedAt, expiresAt: input.expiresAt, evidenceUrl: input.evidenceUrl || null }).returning({ id: userCertificates.id });
  // Anonyme Abschluss-Statistik: Zertifikat zu einem Kurs, in dem die Person vorher gelernt hat.
  if (input.certificationId) {
    await recordCertified(userId, input.certificationId, row.id, input.earnedAt);
    await addSkillFromCourse(userId, input.certificationId, "certificate");
  }
  return row.id;
}

export async function setCertificateShared(userId: string, id: string, shared: boolean): Promise<void> {
  const [row] = await getDb().update(userCertificates).set({ sharedWithCompany: shared }).where(and(eq(userCertificates.id, id), eq(userCertificates.userId, userId))).returning({ id: userCertificates.id });
  if (!row) throw new CertNotFoundError();
}

export async function deleteOwnCertificate(userId: string, id: string): Promise<void> {
  const [row] = await getDb().delete(userCertificates).where(and(eq(userCertificates.id, id), eq(userCertificates.userId, userId))).returning({ id: userCertificates.id });
  if (!row) throw new CertNotFoundError();
}

/** Prüfung bestanden (Prüfungsplaner): legt das Zertifikat an, Gültigkeit aus dem Kurs (`validity_months`). Doppelte am selben Tag werden nicht angelegt. */
export async function createFromPassedExam(userId: string, certificationId: string, earnedAt: Date = new Date()): Promise<string | null> {
  const db = getDb();
  const [cert] = await db.select({ name: certifications.name, provider: certifications.provider, validityMonths: certifications.validityMonths }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
  if (!cert) return null;
  const day = earnedAt.toISOString().slice(0, 10);
  const existing = await db.select({ id: userCertificates.id, at: userCertificates.earnedAt }).from(userCertificates).where(and(eq(userCertificates.userId, userId), eq(userCertificates.certificationId, certificationId)));
  if (existing.some((e) => e.at.toISOString().slice(0, 10) === day)) return null;
  const [row] = await db.insert(userCertificates).values({ userId, certificationId, title: cert.name, vendor: cert.provider, earnedAt, expiresAt: expiryFrom(earnedAt, cert.validityMonths) }).returning({ id: userCertificates.id });
  await recordCertified(userId, certificationId, row.id, earnedAt);
  await addSkillFromCourse(userId, certificationId, "certificate");
  return row.id;
}

export async function listMyVouchers(userId: string) {
  return getDb()
    .select({ id: examVouchers.id, certificationId: examVouchers.certificationId, certName: certifications.name, expiresAt: examVouchers.expiresAt, redeemedAt: examVouchers.redeemedAt, note: examVouchers.note, orgName: organizations.name, hasCode: examVouchers.codeEncrypted })
    .from(examVouchers)
    .innerJoin(certifications, eq(certifications.id, examVouchers.certificationId))
    .innerJoin(organizations, eq(organizations.id, examVouchers.organizationId))
    .where(eq(examVouchers.assignedUserId, userId))
    .orderBy(asc(examVouchers.expiresAt));
}

/** Gutscheincode: nur der zugewiesenen Person (alle anderen: nicht auffindbar). */
export async function revealVoucherCode(userId: string, id: string): Promise<string | null> {
  const [row] = await getDb().select({ code: examVouchers.codeEncrypted }).from(examVouchers).where(and(eq(examVouchers.id, id), eq(examVouchers.assignedUserId, userId))).limit(1);
  if (!row) throw new CertNotFoundError();
  if (!row.code) return null;
  try {
    return decryptSecret(row.code);
  } catch (error) {
    if (error instanceof DecryptionFailedError) return null;
    throw error;
  }
}

export async function setVoucherRedeemed(userId: string, id: string, redeemed: boolean): Promise<void> {
  const [row] = await getDb().update(examVouchers).set({ redeemedAt: redeemed ? new Date() : null }).where(and(eq(examVouchers.id, id), eq(examVouchers.assignedUserId, userId))).returning({ id: examVouchers.id });
  if (!row) throw new CertNotFoundError();
}

