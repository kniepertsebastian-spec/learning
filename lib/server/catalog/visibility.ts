import { and, eq, or, type SQL } from "drizzle-orm";
import { certifications } from "@/lib/server/db/schema";
import { getCompanyMembership } from "@/lib/server/company/access";

/**
 * Wer einen Lernpfad sehen darf (Startseite und Seiten unter /cert):
 *  - Allgemeine Lernpfade: freigegebene (catalog_status = approved) alle; Plattform-Admins auch Entwürfe und
 *    Lernpfade in Prüfung (sie erstellen und prüfen sie).
 *  - Interne Lernpfade (von der Firma selbst angelegt und geprüft) nur Mitglieder der Organisation, der sie
 *    gehören, und erst, wenn die Firma sie freigegeben hat. Plattform-Admins haben darauf KEINEN Zugriff:
 *    Firmendaten gehören der Firma.
 * Hinweis: Die Lern-APIs unter /api/(progress|exams|study-profile|cert)/[certId] prüfen das noch nicht;
 * das ist vor dem ersten internen Lernpfad nachzuziehen (siehe Roadmap).
 */
export type Viewer = { id: string; role: "learner" | "admin" } | null;

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
  if (!viewer || cert.catalogStatus !== "approved") return false;
  const membership = await getCompanyMembership(viewer.id);
  return membership !== null && membership.organizationId === cert.ownerOrganizationId;
}
