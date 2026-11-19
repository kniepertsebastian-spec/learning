import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";

/**
 * Die Zeile des angemeldeten Nutzers, einmal je Anfrage (React `cache`, R6 im Review vom 19.11.2026): Der jwt-Callback
 * (Sitzungsversion) und getCurrentUser (Rolle) lesen dieselbe Zeile; Layouts und Seite rufen beide mehrfach auf. Vorher
 * waren das bis zu sieben gleiche Abfragen je Seitenaufruf. Außerhalb des Renderns (Route-Handler, Skripte, Tests) ruft
 * `cache` einfach durch.
 */
export const loadAuthUserRow = cache(async (userId: string) => {
  const [row] = await getDb()
    .select({ id: users.id, email: users.email, role: users.role, sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
});

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
  const row = await loadAuthUserRow(userId);
  return row !== null && row.sessionVersion === (tokenVersion ?? 0);
}
