import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { users, type UserRole } from "../lib/server/db/schema";

/**
 * Dokumentierter Weg, eine Adminrolle zu vergeben oder zu entziehen (R0.2 in
 * roadmap.md) - insbesondere um den bestehenden Betreiber kontrolliert zum
 * ersten Administrator zu machen, nachdem er sich normal über /register
 * registriert hat. requireAdmin() (lib/server/auth-guards.ts) liest die Rolle
 * bei jedem Request frisch aus der DB, ein Entzug wirkt also sofort.
 *
 * Usage: npm run user:set-role -- <email> <admin|learner>
 */
async function main() {
  const [, , emailArg, roleArg] = process.argv;
  const email = emailArg?.trim().toLowerCase();
  const role = roleArg?.trim().toLowerCase() as UserRole | undefined;

  if (!email || (role !== "admin" && role !== "learner")) {
    console.error("Usage: npm run user:set-role -- <email> <admin|learner>");
    process.exit(1);
  }

  const db = getDb();
  const [user] = await db
    .update(users)
    .set({ role })
    .where(eq(users.email, email))
    .returning({ id: users.id, email: users.email, role: users.role });

  if (!user) {
    console.error(`Kein Nutzer mit E-Mail "${email}" gefunden. Erst über /register registrieren.`);
    process.exit(1);
  }

  console.log(`OK: ${user.email} ist jetzt "${user.role}".`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Rollenzuweisung fehlgeschlagen:", err);
  process.exit(1);
});
