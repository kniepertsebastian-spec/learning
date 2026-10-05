import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";

export type ChangePasswordResult = "ok" | "wrong_password" | "not_found";

/**
 * Ändert das Passwort nach Prüfung des aktuellen. Erhöht die Sitzungsversion: ALLE bestehenden
 * Sitzungen (auch die aktuelle) werden ungültig, der Nutzer meldet sich neu an
 * (lib/server/session-validity.ts). Die Regeln für das neue Passwort prüft der Aufrufer
 * (lib/server/password-policy.ts).
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const db = getDb();
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return "not_found";
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) return "wrong_password";

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId));

  await recordAuditEvent({
    actorUserId: userId,
    action: "account.password_changed",
    targetType: "user",
    targetId: userId,
  }).catch((err) => console.error("Audit-Log fehlgeschlagen:", err));
  return "ok";
}
