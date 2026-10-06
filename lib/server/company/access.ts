import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  organizationMemberships,
  organizations,
  type CompanyRole,
} from "@/lib/server/db/schema";

export type CompanyMembership = {
  userId: string;
  organizationId: string;
  organizationName: string;
  role: CompanyRole;
};

/** Rollen, die die Statusübersicht der Firma sehen dürfen. Lernende sehen sie nicht. */
export const STATUS_VIEW_ROLES: readonly CompanyRole[] = ["company_admin", "mentor"];

/** Rollen, die Lernpfade zuweisen, Fristen ändern und Zuweisungen entfernen dürfen. */
export const ASSIGN_ROLES: readonly CompanyRole[] = ["company_admin", "mentor"];

/** Rollen, die Firmendokumente hochladen, ansehen und löschen dürfen. */
export const DOCUMENT_ROLES: readonly CompanyRole[] = ["company_admin", "mentor"];

/**
 * Lädt die Mitgliedschaft IMMER frisch aus der Datenbank (wie getCurrentUser in
 * auth-guards.ts): ein entzogenes Mitglied oder eine geänderte Rolle wirkt bei
 * der nächsten Anfrage, nicht erst, wenn das Session-Token abläuft. Gibt null
 * zurück, wenn der Nutzer zu keiner Organisation gehört.
 */
export async function getCompanyMembership(userId: string): Promise<CompanyMembership | null> {
  const [row] = await getDb()
    .select({
      userId: organizationMemberships.userId,
      organizationId: organizationMemberships.organizationId,
      organizationName: organizations.name,
      role: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Reine Entscheidung ohne I/O: darf diese Mitgliedschaft einen Bereich mit diesen Rollen nutzen? */
export function isRoleAllowed(
  membership: CompanyMembership | null,
  allowed: readonly CompanyRole[],
): membership is CompanyMembership {
  return membership !== null && allowed.includes(membership.role);
}
