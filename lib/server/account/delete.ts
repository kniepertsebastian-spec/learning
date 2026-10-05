import bcrypt from "bcryptjs";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  auditEvents,
  companyInvitations,
  organizationMemberships,
  users,
} from "@/lib/server/db/schema";

export type DeleteAccountResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "wrong_password" | "platform_admin" | "last_company_admin";
    };

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
 * Verweigert wird bewusst, wenn das Konto Plattform-Admin ist oder der letzte Firmen-Admin einer
 * Organisation: sonst bliebe der Betrieb bzw. die Firma ohne Verwaltung. Die Rolle muss vorher
 * übertragen werden (npm run user:set-role bzw. company:set-member).
 */
export async function deleteAccount(
  userId: string,
  password: string,
): Promise<DeleteAccountResult> {
  const db = getDb();
  const [user] = await db
    .select({ email: users.email, passwordHash: users.passwordHash, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { ok: false, reason: "not_found" };
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    return { ok: false, reason: "wrong_password" };
  }
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
