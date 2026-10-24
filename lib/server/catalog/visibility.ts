import { and, eq, or, type SQL } from "drizzle-orm";
import { certifications, type UserRole } from "@/lib/server/db/schema";
import { getCompanyMembership } from "@/lib/server/company/access";

/**
 * Wer einen Lernpfad sehen darf (Startseite und Seiten unter /cert):
 *  - Allgemeine Lernpfade: freigegebene (catalog_status = approved) alle; Plattform-Admins auch Entwürfe und
 *    Lernpfade in Prüfung (sie erstellen und prüfen sie).
 *  - Interne Lernpfade (von der Firma selbst angelegt und geprüft) nur Mitglieder der Organisation, der sie
 *    gehören, und erst, wenn die Firma sie freigegeben hat; den Entwurf vorher sehen nur Mentor und Firmen-Admin
 *    (sie prüfen ihn). Plattform-Admins haben darauf KEINEN Zugriff:
 *    Firmendaten gehören der Firma.
 * Die Lern-APIs prüfen dieselbe Regel über lib/server/catalog/access.ts.
 */
export type Viewer = { id: string; role: UserRole } | null;

/** SQL-Bedingung für Listen. */
export async function visibleCertificationsCondition(viewer: Viewer): Promise<SQL | undefined> {
  const membership = viewer ? await getCompanyMembership(viewer.id) : null;
  const ownInternal = membership
    ? and(eq(certifications.kind, "internal"), eq(certifications.ownerOrganizationId, membership.organizationId), eq(certifications.catalogStatus, "approved"))
    : undefined;
  const general = viewer?.role === "admin" ? eq(certifications.kind, "general") : and(eq(certifications.kind, "general"), eq(certifications.catalogStatus, "approved"));
  return ownInternal ? or(general, ownInternal) : general;
}

/** Einzelprüfung für eine Seite. */
export async function canViewCertification(
  viewer: Viewer,
  cert: { kind: "general" | "internal"; ownerOrganizationId: string | null; catalogStatus: "draft" | "in_review" | "approved" },
): Promise<boolean> {
  if (cert.kind === "general") return cert.catalogStatus === "approved" || viewer?.role === "admin";
  if (!viewer) return false;
  const membership = await getCompanyMembership(viewer.id);
  if (membership === null || membership.organizationId !== cert.ownerOrganizationId) return false;
  if (cert.catalogStatus === "approved") return true;
  // Den KI-Entwurf prüfen Mentor und Firmen-Admin der Firma; Lernende sehen ihn erst nach der Freigabe.
  return membership.role === "company_admin" || membership.role === "mentor";
}
