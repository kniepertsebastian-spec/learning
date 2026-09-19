import { config } from "dotenv";
// .env (Basis, von docker-compose genutzt) zuerst laden, .env.local danach als
// optionaler lokaler Override - vorher wurde ausschließlich .env.local
// geladen, wodurch Setups mit nur .env (z.B. der Server) ohne Fehlermeldung
// keine Env-Vars bekamen.
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "../lib/server/db/client";
import { users } from "../lib/server/db/schema";
import { recordAuditEvent } from "../lib/server/audit/service";

/**
 * Es gibt bewusst keinen Self-Service-"Passwort vergessen"-Flow (keine
 * E-Mail-Infrastruktur, siehe app/api/register/route.ts) - Passwort-Resets
 * laufen daher wie Rollenänderungen (siehe set-user-role.ts) über den
 * Betreiber mit direktem DB-Zugriff. Dieselbe Mindestlänge wie /api/register
 * (min. 8 Zeichen), derselbe bcrypt-Cost-Faktor wie dort.
 *
 * Usage: npm run user:reset-password -- <email> <neues-passwort>
 */
async function main() {
  const [, , emailArg, passwordArg] = process.argv;
  const email = emailArg?.trim().toLowerCase();
  const password = passwordArg;

  if (!email || !password || password.length < 8) {
    console.error("Usage: npm run user:reset-password -- <email> <neues-passwort (min. 8 Zeichen)>");
    process.exit(1);
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!existing) {
    console.error(`Kein Nutzer mit E-Mail "${email}" gefunden.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.email, email));

  await recordAuditEvent({
    actorType: "cli",
    action: "user.password_reset",
    targetType: "user",
    targetId: existing.id,
    metadata: { email: existing.email },
  }).catch((err) => console.error("Audit-Log fehlgeschlagen:", err));

  console.log(`OK: Passwort für ${existing.email} wurde zurückgesetzt.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Passwort-Reset fehlgeschlagen:", err);
  process.exit(1);
});
