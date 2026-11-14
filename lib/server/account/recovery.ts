import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import { accountTokens, users } from "@/lib/server/db/schema";
import { normalizeEmail } from "@/lib/server/email";
import { appUrl, getMailConfig } from "@/lib/server/mail/config";
import { sendMail } from "@/lib/server/mail/mailer";
import { resetPasswordMessage, verifyEmailMessage } from "@/lib/server/mail/templates";
import { consumeAccountToken, createAccountToken } from "./tokens";

/** Verschickt den Bestätigungslink an ein Konto. false = Versand nicht konfiguriert oder fehlgeschlagen. */
export async function sendVerificationEmail(userId: string, email: string): Promise<boolean> {
  const config = getMailConfig();
  if (!config) return false;
  const token = await createAccountToken(userId, "verify_email");
  return sendMail(verifyEmailMessage(email, appUrl(`/verify-email/${token}`, config)));
}

/**
 * „Passwort vergessen“: Existiert die Adresse, geht ein Reset-Link raus. Der Aufrufer (API) antwortet
 * IMMER gleich und wartet nicht auf das Ergebnis, damit weder Antwort noch Antwortzeit verraten,
 * ob die Adresse registriert ist.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const config = getMailConfig();
  if (!config) return;
  const [user] = await getDb()
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  if (!user) return;
  const token = await createAccountToken(user.id, "reset_password");
  await sendMail(resetPasswordMessage(user.email, appUrl(`/reset-password/${token}`, config)));
}

/** Bestätigungslink erneut senden - nur für Konten, die noch nicht bestätigt sind. */
export async function resendVerificationEmail(email: string): Promise<void> {
  if (!getMailConfig()) return;
  const [user] = await getDb()
    .select({ id: users.id, email: users.email, verified: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  if (!user || user.verified) return;
  await sendVerificationEmail(user.id, user.email);
}

/** Löst den Bestätigungslink ein. true = E-Mail ist jetzt bestätigt. */
export async function verifyEmailWithToken(token: string): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const userId = await consumeAccountToken(token, "verify_email", new Date(), tx);
    if (!userId) return false;
    await tx
      .update(users)
      .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
      .where(eq(users.id, userId));
    return true;
  });
}

/**
 * Setzt per Reset-Link ein neues Passwort. Das Token wird verbraucht, alle Sitzungen enden
 * (Sitzungsversion), noch offene Reset-Links verfallen, und die E-Mail gilt als bestätigt (wer den
 * Link aus dem Postfach hat, kontrolliert die Adresse). Die Regeln für das neue Passwort prüft der
 * Aufrufer (lib/server/password-policy.ts). false = Link ungültig, abgelaufen oder schon benutzt.
 */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const userId = await getDb().transaction(async (tx) => {
    const id = await consumeAccountToken(token, "reset_password", new Date(), tx);
    if (!id) return null;
    await tx
      .update(users)
      .set({
        passwordHash,
        // Auch ein SSO-Konto hat danach ein lokales Passwort (Aufgabe 09).
        passwordSet: true,
        sessionVersion: sql`${users.sessionVersion} + 1`,
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
      })
      .where(eq(users.id, id));
    await tx
      .delete(accountTokens)
      .where(
        and(
          eq(accountTokens.userId, id),
          eq(accountTokens.purpose, "reset_password"),
          isNull(accountTokens.usedAt),
        ),
      );
    return id;
  });
  if (!userId) return false;

  await recordAuditEvent({
    actorUserId: userId,
    action: "account.password_reset",
    targetType: "user",
    targetId: userId,
  }).catch((err) => console.error("Audit-Log fehlgeschlagen:", err));
  return true;
}
