import { and, eq, or, type SQL } from "drizzle-orm";
import { certifications } from "@/lib/server/db/schema";
import { getCompanyMembership } from "@/lib/server/company/access";

/**
 * Wer einen Lernpfad sehen darf (Startseite und Seiten unter /cert):
 *  - Plattform-Admins sehen alles (sie erstellen und prüfen die Lernpfade).
 *  - Alle anderen nur fachlich freigegebene (catalog_status = approved).
 *  - Interne Lernpfade nur Mitglieder der Organisation, der sie gehören.
 * Hinweis: Die Lern-APIs unter /api/(progress|exams|study-profile|cert)/[certId] prüfen das noch nicht;
 * das ist vor dem ersten internen Lernpfad nachzuziehen (siehe Roadmap).
 */
export type Viewer = { id: string; role: "learner" | "admin" } | null;

/** SQL-Bedingung für Listen. */
export async function visibleCertificationsCondition(viewer: Viewer): Promise<SQL | undefined> {
  if (viewer?.role === "admin") return undefined;
  const membership = viewer ? await getCompanyMembership(viewer.id) : null;
  return and(
    eq(certifications.catalogStatus, "approved"),
    membership
      ? or(eq(certifications.kind, "general"), eq(certifications.ownerOrganizationId, membership.organizationId))
      : eq(certifications.kind, "general"),
  );
}

/** Einzelprüfung für eine Seite. */
export async function canViewCertification(
  viewer: Viewer,
  cert: { kind: "general" | "internal"; ownerOrganizationId: string | null; catalogStatus: "draft" | "in_review" | "approved" },
): Promise<boolean> {
  if (viewer?.role === "admin") return true;
  if (cert.catalogStatus !== "approved") return false;
  if (cert.kind === "general") return true;
  if (!viewer) return false;
  const membership = await getCompanyMembership(viewer.id);
  return membership !== null && membership.organizationId === cert.ownerOrganizationId;
}
