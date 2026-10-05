import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import {
  organizationMemberships,
  organizations,
  users,
  type CompanyRole,
} from "../lib/server/db/schema";
import { normalizeEmail } from "../lib/server/email";
import { recordAuditEvent } from "../lib/server/audit/service";

/**
 * Betreiber-Skript für Organisationen (Phase 1 in docs/ROADMAP-TECHNISCH.md),
 * solange es keine Oberfläche dafür gibt (Einladungen per E-Mail kommen in Phase 2).
 *
 * Usage:
 *   npm run company:create -- "<Firmenname>"
 *   npm run company:set-member -- <organization-id> <email> <company_admin|mentor|learner>
 *   npm run company:remove-member -- <email>
 *
 * Ein Nutzer gehört zu genau einer Organisation: set-member legt die
 * Mitgliedschaft an oder ändert bei gleicher Organisation die Rolle; gehört
 * der Nutzer schon zu einer anderen, bricht es ab (erst remove-member).
 */
const ROLES: CompanyRole[] = ["company_admin", "mentor", "learner"];

function usage(): never {
  console.error(
    'Usage:\n  company:create -- "<Firmenname>"\n  company:set-member -- <organization-id> <email> <company_admin|mentor|learner>\n  company:remove-member -- <email>',
  );
  process.exit(1);
}

async function findUser(emailArg: string | undefined) {
  if (!emailArg) usage();
  const email = normalizeEmail(emailArg);
  const [user] = await getDb()
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    console.error(`Kein Nutzer mit E-Mail "${email}" gefunden. Erst über /register registrieren.`);
    process.exit(1);
  }
  return user;
}

async function main() {
  const [, , command, ...args] = process.argv;
  const db = getDb();

  if (command === "create") {
    const name = args[0]?.trim();
    if (!name) usage();
    const [org] = await db.insert(organizations).values({ name }).returning();
    await recordAuditEvent({
      actorType: "cli",
      action: "organization.created",
      targetType: "organization",
      targetId: org.id,
      metadata: { name },
    }).catch((err) => console.error("Audit-Log fehlgeschlagen:", err));
    console.log(`OK: Organisation "${org.name}" angelegt. ID: ${org.id}`);
  } else if (command === "set-member") {
    const [orgId, emailArg, roleArg] = args;
    const role = roleArg as CompanyRole | undefined;
    if (!orgId || !role || !ROLES.includes(role)) usage();
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) {
      console.error(`Organisation "${orgId}" nicht gefunden.`);
      process.exit(1);
    }
    const user = await findUser(emailArg);
    const [existing] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.userId, user.id))
      .limit(1);
    if (existing && existing.organizationId !== org.id) {
      console.error(
        `${user.email} gehört schon zu einer anderen Organisation (${existing.organizationId}). Erst remove-member.`,
      );
      process.exit(1);
    }
    if (existing) {
      await db
        .update(organizationMemberships)
        .set({ role })
        .where(eq(organizationMemberships.id, existing.id));
    } else {
      await db.insert(organizationMemberships).values({ organizationId: org.id, userId: user.id, role });
    }
    await recordAuditEvent({
      actorType: "cli",
      action: "membership.set",
      targetType: "user",
      targetId: user.id,
      metadata: { organizationId: org.id, oldRole: existing?.role ?? null, newRole: role },
    }).catch((err) => console.error("Audit-Log fehlgeschlagen:", err));
    console.log(`OK: ${user.email} ist jetzt "${role}" in "${org.name}".`);
  } else if (command === "remove-member") {
    const user = await findUser(args[0]);
    const removed = await db
      .delete(organizationMemberships)
      .where(eq(organizationMemberships.userId, user.id))
      .returning({ organizationId: organizationMemberships.organizationId });
    if (!removed.length) {
      console.error(`${user.email} gehört zu keiner Organisation.`);
      process.exit(1);
    }
    await recordAuditEvent({
      actorType: "cli",
      action: "membership.removed",
      targetType: "user",
      targetId: user.id,
      metadata: { organizationId: removed[0].organizationId },
    }).catch((err) => console.error("Audit-Log fehlgeschlagen:", err));
    console.log(`OK: ${user.email} ist aus der Organisation entfernt (Zuweisungen sind mit entfernt).`);
  } else {
    usage();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fehlgeschlagen:", err);
  process.exit(1);
});
