import { forbidden, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import type { CompanyRole } from "@/lib/server/db/schema";
import { getCompanyMembership, isRoleAllowed, type CompanyMembership } from "./access";

/**
 * Zentraler Guard für alle Firmenzugriffe (Phase 1). Die Organisation kommt
 * ausschließlich aus der Mitgliedschaft des angemeldeten Nutzers - nie aus
 * Pfad-, Query- oder Body-Parametern. Aufrufer verwenden danach nur
 * `membership.organizationId`. Plattform-Admins (users.role = "admin") haben
 * hier KEINE Sonderrechte: Firmendaten gehören der Firma.
 */

/** Guard für Firmen-API-Routen: Mitgliedschaft oder fertige 401/403-Antwort. */
export async function requireCompanyApi(
  allowed: readonly CompanyRole[],
): Promise<{ ok: true; membership: CompanyMembership } | { ok: false; response: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const membership = await getCompanyMembership(session.user.id);
  if (!isRoleAllowed(membership, allowed)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, membership };
}

/** Guard für Firmen-Seiten: Login-Weiterleitung bzw. echtes 403 (app/forbidden.tsx). */
export async function requireCompanyPage(
  allowed: readonly CompanyRole[],
  fromPath?: string,
): Promise<CompanyMembership> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(fromPath ? `/login?from=${encodeURIComponent(fromPath)}` : "/login");
  }

  const membership = await getCompanyMembership(session.user.id);
  if (!isRoleAllowed(membership, allowed)) forbidden();
  return membership;
}
