import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import {
  companyClaims,
  organizationMemberships,
  organizations,
  users,
} from "@/lib/server/db/schema";
import { normalizeEmail } from "@/lib/server/email";
import { appUrl, getMailConfig } from "@/lib/server/mail/config";
import { sendMail } from "@/lib/server/mail/mailer";
import { companyConfirmMessage } from "@/lib/server/mail/templates";

/** Der Bestätigungslink ist 24 Stunden gültig. */
export const COMPANY_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

/** Anbieter privater Postfächer: sie beweisen keine Zugehörigkeit zu einem Unternehmen. */
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "web.de", "t-online.de",
  "outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de", "msn.com",
  "yahoo.com", "yahoo.de", "icloud.com", "me.com", "mac.com", "aol.com", "freenet.de",
  "posteo.de", "mailbox.org", "proton.me", "protonmail.com", "tutanota.com", "tuta.com", "example.com",
]);

export const COMPANY_NAME_MAX = 120;

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Reine Prüfung: eine Adresse mit eigener Firmen-Domain (kein Freemail-Anbieter). */
export function isCompanyEmail(email: string): boolean {
  const domain = normalizeEmail(email).split("@")[1];
  return !!domain && domain.includes(".") && !FREE_MAIL_DOMAINS.has(domain);
}

/** Entfernt Steuerzeichen und doppelte Leerzeichen; leer = ungültig. */
export function cleanCompanyName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, COMPANY_NAME_MAX);
}

export type RequestClaimResult =
  | { ok: true }
  | { ok: false; reason: "already_member" | "not_company_email" | "invalid_name" | "mail_unavailable" | "send_failed" };

/**
 * Legt eine Firmen-Anfrage für das Konto an (eine frühere offene wird ersetzt) und schickt den
 * Bestätigungslink an die Firmen-E-Mail. Die Organisation entsteht erst in confirmCompanyClaim.
 */
export async function requestCompanyClaim(input: {
  userId: string;
  companyName: string;
  companyEmail: string;
  now?: Date;
}): Promise<RequestClaimResult> {
  const config = getMailConfig();
  if (!config) return { ok: false, reason: "mail_unavailable" };
  const companyName = cleanCompanyName(input.companyName);
  if (!companyName) return { ok: false, reason: "invalid_name" };
  const companyEmail = normalizeEmail(input.companyEmail);
  if (!isCompanyEmail(companyEmail)) return { ok: false, reason: "not_company_email" };

  const now = input.now ?? new Date();
  const db = getDb();
  const [member] = await db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, input.userId))
    .limit(1);
  if (member) return { ok: false, reason: "already_member" };

  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx
      .delete(companyClaims)
      .where(and(eq(companyClaims.userId, input.userId), isNull(companyClaims.usedAt)));
    await tx.insert(companyClaims).values({
      userId: input.userId,
      companyName,
      companyEmail,
      tokenHash: hashClaimToken(token),
      expiresAt: new Date(now.getTime() + COMPANY_CLAIM_TTL_MS),
    });
  });

  const sent = await sendMail(
    companyConfirmMessage(companyEmail, appUrl(`/confirm-company/${token}`, config), companyName),
  );
  return sent ? { ok: true } : { ok: false, reason: "send_failed" };
}

export type ConfirmClaimResult =
  | { ok: true; organizationId: string; organizationName: string; userId: string }
  | { ok: false; reason: "invalid" | "already_member" };

/**
 * Löst den Link ein: legt die Organisation an und macht das Konto zum Firmen-Admin. Das Token wird
 * atomar verbraucht (bei parallelen Versuchen gewinnt genau einer). Entspricht die Firmenadresse der
 * Konto-Adresse, gilt damit auch die Konto-E-Mail als bestätigt. Ist das Konto inzwischen Mitglied
 * einer Organisation (z. B. per Einladung), wird nichts angelegt.
 */
export async function confirmCompanyClaim(token: string, now: Date = new Date()): Promise<ConfirmClaimResult> {
  const result = await getDb().transaction(async (tx): Promise<ConfirmClaimResult> => {
    const [claim] = await tx
      .update(companyClaims)
      .set({ usedAt: now })
      .where(
        and(
          eq(companyClaims.tokenHash, hashClaimToken(token)),
          isNull(companyClaims.usedAt),
          gt(companyClaims.expiresAt, now),
        ),
      )
      .returning();
    if (!claim) return { ok: false, reason: "invalid" };

    const [member] = await tx
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.userId, claim.userId))
      .limit(1);
    if (member) return { ok: false, reason: "already_member" };

    const [org] = await tx.insert(organizations).values({ name: claim.companyName }).returning();
    await tx
      .insert(organizationMemberships)
      .values({ organizationId: org.id, userId: claim.userId, role: "company_admin" });
    await tx
      .update(users)
      .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
      .where(and(eq(users.id, claim.userId), eq(users.email, claim.companyEmail)));
    return { ok: true, organizationId: org.id, organizationName: org.name, userId: claim.userId };
  });

  if (result.ok) {
    await recordAuditEvent({
      actorUserId: result.userId,
      action: "organization.created_by_claim",
      targetType: "organization",
      targetId: result.organizationId,
      metadata: { name: result.organizationName },
    }).catch((err) => console.error("Audit-Log fehlgeschlagen:", err));
  }
  return result;
}

/**
 * Ohne E-Mail-Versand gibt es keinen Weg zur Bestätigung: dann legt die Registrierung die Firma
 * sofort an (wie dort auch die Konto-E-Mail ohne Versand als bestätigt gilt).
 */
export async function createOrganizationForUser(userId: string, companyName: string): Promise<void> {
  const name = cleanCompanyName(companyName);
  await getDb().transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name }).returning();
    await tx.insert(organizationMemberships).values({ organizationId: org.id, userId, role: "company_admin" });
  });
}
