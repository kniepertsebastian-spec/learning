import bcrypt from "bcryptjs";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  auditEvents,
  companyInvitations,
  organizationMemberships,
  userIdentities,
  users,
} from "@/lib/server/db/schema";
import { normalizeEmail } from "@/lib/server/email";

export type DeleteAccountResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not_found"
        | "wrong_password"
        | "password_required"
        | "wrong_email"
        | "stale_session"
        | "platform_admin"
        | "last_company_admin";
    };

/** Wie lange eine Anmeldung als frisch gilt, wenn ein SSO-Konto ohne Passwort gelöscht wird (Aufgabe 09). */
export const FRESH_LOGIN_MS = 10 * 60_000;

/**
 * Bestätigung der Löschung: das aktuelle Passwort, oder (nur bei Konten mit Firmen-Anmeldung, Aufgabe 09) die eigene
 * E-Mail-Adresse bei frischer Anmeldung. Wer nur über das Firmenkonto angemeldet ist, kennt kein Passwort.
 */
export type DeleteConfirmation =
  | { password: string }
  | { email: string; authenticatedAt: Date | null; now?: Date };

/** Wie die Löschung bestätigt wird: mit Passwort, oder bei einem SSO-Konto ohne lokales Passwort mit der E-Mail-Adresse. */
export async function deletionConfirmationMode(userId: string): Promise<"password" | "email"> {
  const db = getDb();
  const [user] = await db.select({ passwordSet: users.passwordSet }).from(users).where(eq(users.id, userId)).limit(1);
  if (user?.passwordSet !== false) return "password";
  return (await hasSsoIdentity(userId)) ? "email" : "password";
}

async function hasSsoIdentity(userId: string): Promise<boolean> {
  const [identity] = await getDb().select({ id: userIdentities.id }).from(userIdentities).where(eq(userIdentities.userId, userId)).limit(1);
  return Boolean(identity);
}

async function checkConfirmation(
  userId: string,
  user: { email: string; passwordHash: string },
  confirmation: DeleteConfirmation,
): Promise<DeleteAccountResult | null> {
  if ("password" in confirmation) {
    return (await bcrypt.compare(confirmation.password, user.passwordHash)) ? null : { ok: false, reason: "wrong_password" };
  }
  // Ohne Passwort nur für Konten mit Firmen-Anmeldung; ein reines Passwort-Konto bleibt beim Passwort.
  if (!(await hasSsoIdentity(userId))) return { ok: false, reason: "password_required" };
  if (normalizeEmail(confirmation.email) !== normalizeEmail(user.email)) return { ok: false, reason: "wrong_email" };
  const now = confirmation.now ?? new Date();
  const at = confirmation.authenticatedAt;
  if (!at || now.getTime() - at.getTime() > FRESH_LOGIN_MS || at.getTime() > now.getTime() + 60_000) {
    return { ok: false, reason: "stale_session" };
  }
  return null;
}

/**
 * Löscht das Konto samt persönlicher Daten (Self-Service).
 *
 * Wirkung:
 * - Alle Fremdschlüssel auf users sind CASCADE (Lern- und Mitgliedsdaten verschwinden mit dem
 *   Nutzer, auch Zuweisungen über die Mitgliedschaft) oder SET NULL (Betriebsdaten wie
 *   Audit-Ereignisse, Meldungen, Jobs bleiben anonymisiert). Ein Test hält das fest.
 * - Zusätzlich entfernt diese Funktion, was kein Fremdschlüssel erwischt: Einladungen an die
 *   eigene E-Mail-Adresse und die Metadaten (z. B. E-Mail) von Audit-Ereignissen über das Konto.
 * - Bestehende Sitzungen werden ungültig, weil der Nutzer nicht mehr existiert
 *   (lib/server/session-validity.ts).
 *
 * Bestätigt wird mit dem Passwort, bei Konten mit Firmen-Anmeldung (SSO) alternativ mit der eigenen E-Mail-Adresse bei
 * frischer Anmeldung (Aufgabe 09, siehe `DeleteConfirmation`). Die gelöschten Daten sind in beiden Fällen dieselben.
 *
 * Verweigert wird bewusst, wenn das Konto Plattform-Admin ist oder der letzte Firmen-Admin einer
 * Organisation: sonst bliebe der Betrieb bzw. die Firma ohne Verwaltung. Die Rolle muss vorher
 * übertragen werden (npm run user:set-role bzw. company:set-member).
 */
export async function deleteAccount(
  userId: string,
  confirmation: DeleteConfirmation,
): Promise<DeleteAccountResult> {
  const db = getDb();
  const [user] = await db
    .select({ email: users.email, passwordHash: users.passwordHash, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { ok: false, reason: "not_found" };
  const refused = await checkConfirmation(userId, user, confirmation);
  if (refused) return refused;
  if (user.role === "admin") return { ok: false, reason: "platform_admin" };

  const [membership] = await db
    .select({ organizationId: organizationMemberships.organizationId, role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, userId))
    .limit(1);
  if (membership?.role === "company_admin") {
    const [admins] = await db
      .select({ n: count() })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, membership.organizationId),
          eq(organizationMemberships.role, "company_admin"),
        ),
      );
    if (admins.n <= 1) return { ok: false, reason: "last_company_admin" };
  }

  await db.transaction(async (tx) => {
    await tx.delete(companyInvitations).where(eq(companyInvitations.email, user.email));
    await tx
      .update(auditEvents)
      .set({ metadata: null })
      .where(and(eq(auditEvents.targetType, "user"), eq(auditEvents.targetId, userId)));
    await tx.delete(users).where(eq(users.id, userId));
    // Nachweis, dass gelöscht wurde, ohne personenbezogene Angaben (die ID verweist ins Leere).
    await tx.insert(auditEvents).values({
      actorUserId: null,
      actorType: "system",
      action: "account.deleted",
      targetType: "user",
      targetId: userId,
    });
  });
  return { ok: true };
}
