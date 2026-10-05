import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import { normalizeEmail } from "@/lib/server/email";
import { isMailConfigured } from "@/lib/server/mail/config";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  sessionVersion: number;
};

let dummyHash: string | undefined;

/**
 * Prüft E-Mail und Passwort. null bei unbekannter Adresse, falschem Passwort UND - wenn der
 * E-Mail-Versand eingerichtet ist - bei noch nicht bestätigter Adresse (von außen nicht zu
 * unterscheiden). Bei unbekannter Adresse läuft trotzdem ein bcrypt-Vergleich, damit die
 * Antwortzeit nicht verrät, ob es das Konto gibt.
 */
export async function authenticateUser(
  rawEmail: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(rawEmail)))
    .limit(1);

  if (!user) {
    dummyHash ??= await bcrypt.hash("kein-konto", 12);
    await bcrypt.compare(password, dummyHash);
    return null;
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;
  if (isMailConfigured() && !user.emailVerifiedAt) return null;

  return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
}
