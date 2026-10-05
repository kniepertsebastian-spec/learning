import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";

/**
 * Prüft bei jedem Lesen der Sitzung (jwt-Callback in lib/server/auth.ts), ob das Token noch
 * gilt: Der Nutzer muss existieren (Konto nicht gelöscht) und die Sitzungsversion muss passen
 * (Passwort wurde nicht geändert). So beendet ein Passwortwechsel oder eine Kontolöschung auch
 * Sitzungen auf anderen Geräten, obwohl JWTs sonst bis zum Ablauf gültig blieben.
 * Tokens aus der Zeit vor der Einführung tragen keine Version und zählen als Version 0.
 */
export async function isSessionTokenValid(
  userId: string,
  tokenVersion: number | undefined,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(row) && row.sessionVersion === (tokenVersion ?? 0);
}
