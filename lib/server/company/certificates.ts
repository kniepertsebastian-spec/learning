import { and, asc, eq, gte, isNotNull, type SQL } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import { certifications, examPlans, examVouchers, organizationMemberships, userCertificates, users } from "@/lib/server/db/schema";
import { encryptSecret, EncryptionNotConfiguredError, isEncryptionConfigured } from "@/lib/server/crypto/secret-box";
import { certStatus, expiryByMonth, toCsv, VOUCHER_SOON_DAYS, type CertStatus } from "@/lib/certificates/logic";
import { listMandatoryRules } from "@/lib/server/company/mandatory";

/**
 * Zertifikats-Register der Firma (UI U9). Zertifikate und Prüfungstermine sind Daten der Person: die Firma sieht sie nur, wenn
 * die Person sie EINZELN freigegeben hat (`shared_with_company`), und nur die festgeschriebenen Felder unten – keine Punktzahlen,
 * Versuche oder Lernstand. Neue Felder hier sind eine bewusste Entscheidung (certificates-privacy.test.ts hält die Listen fest).
 * Nur Mitglieder der EIGENEN Organisation erscheinen.
 */
export const COMPANY_CERTIFICATE_FIELDS = ["id", "memberName", "memberEmail", "title", "vendor", "earnedAt", "expiresAt", "status"] as const;
export const COMPANY_PLANNED_EXAM_FIELDS = ["id", "memberName", "memberEmail", "certification", "scheduledAt"] as const;
export const COMPANY_VOUCHER_FIELDS = ["id", "certification", "assignedTo", "expiresAt", "redeemedAt", "note", "state", "hasCode"] as const;

export class VoucherError extends Error {}
export class VoucherNotFoundError extends VoucherError {}

export type CompanyCertificate = { id: string; memberName: string | null; memberEmail: string; title: string; vendor: string; earnedAt: Date; expiresAt: Date | null; status: CertStatus };
export type CompanyPlannedExam = { id: string; memberName: string | null; memberEmail: string; certification: string; scheduledAt: Date };

/** Die Freigabebedingung steht an genau einer Stelle; der Datenschutztest prüft, dass ihr Entfernen auffällt. */
export const SHARED_CERTIFICATE: SQL = eq(userCertificates.sharedWithCompany, true);
export const SHARED_PLAN: SQL = eq(examPlans.shareWithCompany, true);

export async function listCompanyCertificates(organizationId: string, now: Date = new Date(), shareFilter: SQL = SHARED_CERTIFICATE): Promise<CompanyCertificate[]> {
  const rows = await getDb()
    .select({ id: userCertificates.id, memberName: users.name, memberEmail: users.email, title: userCertificates.title, vendor: userCertificates.vendor, earnedAt: userCertificates.earnedAt, expiresAt: userCertificates.expiresAt })
    .from(userCertificates)
    .innerJoin(organizationMemberships, and(eq(organizationMemberships.userId, userCertificates.userId), eq(organizationMemberships.organizationId, organizationId)))
    .innerJoin(users, eq(users.id, userCertificates.userId))
    .where(shareFilter)
    .orderBy(asc(userCertificates.expiresAt));
  return rows.map((r) => ({ ...r, status: certStatus(r.expiresAt, now) }));
}

export async function listSharedPlannedExams(organizationId: string, now: Date = new Date(), shareFilter: SQL = SHARED_PLAN): Promise<CompanyPlannedExam[]> {
  const rows = await getDb()
    .select({ id: examPlans.id, memberName: users.name, memberEmail: users.email, certification: certifications.name, scheduledAt: examPlans.scheduledAt })
    .from(examPlans)
    .innerJoin(organizationMemberships, and(eq(organizationMemberships.userId, examPlans.userId), eq(organizationMemberships.organizationId, organizationId)))
    .innerJoin(users, eq(users.id, examPlans.userId))
    .innerJoin(certifications, eq(certifications.id, examPlans.certificationId))
    .where(and(shareFilter, eq(examPlans.status, "planned"), isNotNull(examPlans.scheduledAt), gte(examPlans.scheduledAt, now)))
    .orderBy(asc(examPlans.scheduledAt));
  return rows.flatMap((r) => (r.scheduledAt ? [{ ...r, scheduledAt: r.scheduledAt }] : []));
}

export type VoucherState = "redeemed" | "assigned" | "unassigned" | "expiring" | "expired";
export type CompanyVoucher = { id: string; certification: string; assignedTo: string | null; expiresAt: Date; redeemedAt: Date | null; note: string; state: VoucherState; hasCode: boolean };

export function voucherState(v: { assignedUserId: string | null; expiresAt: Date; redeemedAt: Date | null }, now: Date): VoucherState {
  if (v.redeemedAt) return "redeemed";
  const days = Math.ceil((v.expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= VOUCHER_SOON_DAYS) return "expiring";
  return v.assignedUserId ? "assigned" : "unassigned";
}

/** Gutscheine der Firma OHNE Code (der Code wird nie an die Firma ausgeliefert, nur an die zugewiesene Person). */
export async function listVouchers(organizationId: string, now: Date = new Date()): Promise<CompanyVoucher[]> {
  const rows = await getDb()
    .select({ id: examVouchers.id, certification: certifications.name, assignedUserId: examVouchers.assignedUserId, assignedName: users.name, assignedEmail: users.email, expiresAt: examVouchers.expiresAt, redeemedAt: examVouchers.redeemedAt, note: examVouchers.note, code: examVouchers.codeEncrypted })
    .from(examVouchers)
    .innerJoin(certifications, eq(certifications.id, examVouchers.certificationId))
    .leftJoin(users, eq(users.id, examVouchers.assignedUserId))
    .where(eq(examVouchers.organizationId, organizationId))
    .orderBy(asc(examVouchers.expiresAt));
  return rows.map((r) => ({ id: r.id, certification: r.certification, assignedTo: r.assignedUserId ? (r.assignedName ?? r.assignedEmail) : null, expiresAt: r.expiresAt, redeemedAt: r.redeemedAt, note: r.note, state: voucherState(r, now), hasCode: Boolean(r.code) }));
}

export async function addVoucher(input: { organizationId: string; actorUserId: string; certificationId: string; assignedUserId: string | null; expiresAt: Date; note: string; code: string | null }): Promise<string> {
  const db = getDb();
  if (input.expiresAt.getTime() < Date.now() - 86_400_000) throw new VoucherError("Ablaufdatum liegt in der Vergangenheit.");
  if (input.note.length > 200) throw new VoucherError("Notiz zu lang.");
  const [cert] = await db.select({ id: certifications.id }).from(certifications).where(and(eq(certifications.id, input.certificationId), eq(certifications.catalogStatus, "approved"))).limit(1);
  if (!cert) throw new VoucherNotFoundError();
  if (input.assignedUserId) {
    const [m] = await db.select({ userId: organizationMemberships.userId }).from(organizationMemberships).where(and(eq(organizationMemberships.userId, input.assignedUserId), eq(organizationMemberships.organizationId, input.organizationId))).limit(1);
    if (!m) throw new VoucherNotFoundError();
  }
  let codeEncrypted: string | null = null;
  if (input.code && input.code.trim()) {
    if (!isEncryptionConfigured()) throw new EncryptionNotConfiguredError();
    codeEncrypted = encryptSecret(input.code.trim());
  }
  const [row] = await db.insert(examVouchers).values({ organizationId: input.organizationId, certificationId: input.certificationId, assignedUserId: input.assignedUserId, expiresAt: input.expiresAt, note: input.note.trim(), codeEncrypted, createdByUserId: input.actorUserId }).returning({ id: examVouchers.id });
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "exam_voucher.create", targetType: "exam_voucher", targetId: row.id, metadata: { organizationId: input.organizationId, assigned: Boolean(input.assignedUserId) } }).catch(() => {});
  return row.id;
}

export async function assignVoucher(input: { organizationId: string; actorUserId: string; id: string; assignedUserId: string | null }): Promise<void> {
  const db = getDb();
  if (input.assignedUserId) {
    const [m] = await db.select({ userId: organizationMemberships.userId }).from(organizationMemberships).where(and(eq(organizationMemberships.userId, input.assignedUserId), eq(organizationMemberships.organizationId, input.organizationId))).limit(1);
    if (!m) throw new VoucherNotFoundError();
  }
  const [row] = await db.update(examVouchers).set({ assignedUserId: input.assignedUserId }).where(and(eq(examVouchers.id, input.id), eq(examVouchers.organizationId, input.organizationId))).returning({ id: examVouchers.id });
  if (!row) throw new VoucherNotFoundError();
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "exam_voucher.assign", targetType: "exam_voucher", targetId: row.id, metadata: { organizationId: input.organizationId } }).catch(() => {});
}

export async function removeVoucher(input: { organizationId: string; actorUserId: string; id: string }): Promise<void> {
  const [row] = await getDb().delete(examVouchers).where(and(eq(examVouchers.id, input.id), eq(examVouchers.organizationId, input.organizationId))).returning({ id: examVouchers.id });
  if (!row) throw new VoucherNotFoundError();
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "exam_voucher.delete", targetType: "exam_voucher", targetId: row.id, metadata: { organizationId: input.organizationId } }).catch(() => {});
}

export interface RegisterOverview {
  certificates: CompanyCertificate[];
  planned: CompanyPlannedExam[];
  vouchers: CompanyVoucher[];
  stats: { valid: number; people: number; expiring: number; expired: number; openVouchers: number; vouchersSoon: number };
  months: ReturnType<typeof expiryByMonth>;
}

export async function getRegisterOverview(organizationId: string, now: Date = new Date()): Promise<RegisterOverview> {
  const [certificates, planned, vouchers] = await Promise.all([listCompanyCertificates(organizationId, now), listSharedPlannedExams(organizationId, now), listVouchers(organizationId, now)]);
  const open = vouchers.filter((v) => v.state !== "redeemed" && v.state !== "expired");
  return {
    certificates,
    planned,
    vouchers,
    stats: {
      valid: certificates.filter((c) => c.status !== "expired").length,
      people: new Set(certificates.filter((c) => c.status !== "expired").map((c) => c.memberEmail)).size,
      expiring: certificates.filter((c) => c.status === "expiring").length,
      expired: certificates.filter((c) => c.status === "expired").length,
      openVouchers: open.length,
      vouchersSoon: open.filter((v) => v.state === "expiring").length,
    },
    months: expiryByMonth(certificates.map((c) => c.expiresAt), now),
  };
}

const STATUS_DE: Record<CertStatus, string> = { valid: "Gültig", expiring: "Läuft bald ab", expired: "Abgelaufen" };
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "unbegrenzt");

/** Audit-Export: nur freigegebene Zertifikate + Pflichtschulungs-Status zum Stichtag. Protokolliert den Export. */
export async function buildAuditExport(input: { organizationId: string; organizationName: string; actorUserId: string; actorName: string; now?: Date }): Promise<{ csv: string; lines: { title: string; head: string[]; rows: string[][] }[]; meta: { organization: string; createdAt: string; createdBy: string } }> {
  const now = input.now ?? new Date();
  const [certs, rules] = await Promise.all([listCompanyCertificates(input.organizationId, now), listMandatoryRules(input.organizationId, now)]);
  const certHead = ["Person", "E-Mail", "Zertifikat", "Anbieter", "Erworben", "Gültig bis", "Status"];
  const certRows = certs.map((c) => [c.memberName ?? "", c.memberEmail, c.title, c.vendor, day(c.earnedAt), day(c.expiresAt), STATUS_DE[c.status]]);
  const ruleHead = ["Pflichtschulung", "Zugewiesen", "Abgeschlossen", "Überfällig"];
  const ruleRows = rules.map((r) => [r.learningPath, String(r.assigned), String(r.completed), String(r.overdue)]);
  const meta = { organization: input.organizationName, createdAt: now.toISOString(), createdBy: input.actorName };
  const csv =
    toCsv(["Firma", "Erstellt am", "Erstellt von", "Stichtag"], [[meta.organization, meta.createdAt.slice(0, 10), meta.createdBy, meta.createdAt.slice(0, 10)]]) +
    "\r\n" + toCsv(certHead, certRows) + "\r\n" + toCsv(ruleHead, ruleRows);
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "certificate_register.export", targetType: "organization", targetId: input.organizationId, metadata: { certificates: certs.length, rules: rules.length } }).catch(() => {});
  return { csv, lines: [{ title: "Zertifikate (von den Personen freigegeben)", head: certHead, rows: certRows }, { title: "Pflichtschulungen (Stand zum Stichtag)", head: ruleHead, rows: ruleRows }], meta };
}
