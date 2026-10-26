export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { CourseWorkshop } from "@/components/admin/workshop/CourseWorkshop";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { requireCompanyPage } from "@/lib/server/company/guard";

/**
 * Kurswerkstatt für interne Lernpfade: Firmen-Admin und Mentor bearbeiten Lektionen und Fragen der Kurse ihrer eigenen Firma von Hand
 * (ohne KI, wie in der Prüfer-Ansicht). Die Firma kommt aus der Mitgliedschaft; fremde und allgemeine Kurse sehen aus wie nicht vorhanden.
 */
export default async function CompanyCourseWorkshopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const membership = await requireCompanyPage(STATUS_VIEW_ROLES, `/company/courses/${slug}/workshop`);
  const locale = await getServerLocale();
  const de = locale === "de";
  const [cert] = await getDb()
    .select({ id: certifications.id, name: certifications.name })
    .from(certifications)
    .where(and(eq(certifications.slug, slug), eq(certifications.kind, "internal"), eq(certifications.ownerOrganizationId, membership.organizationId)))
    .limit(1);
  if (!cert) notFound();
  return (
    <div className="flex flex-1 flex-col" data-testid="company-workshop-page">
      <Link href="/company?tab=paths" className="mb-4 flex w-fit items-center gap-1.5 text-sm text-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {de ? "Zurück zu den internen Learnings" : "Back to internal learning"}
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">{de ? "Kurs bearbeiten" : "Edit course"}: {cert.name}</h1>
      <p className="mb-6 text-sm text-subtle">
        {de
          ? "Änderungen sind sofort für Lernende sichtbar. Jeder frühere Stand bleibt in den Versionen erhalten. Freigeben kannst du bei den internen Learnings."
          : "Changes are visible to learners immediately. Every earlier version stays in the history. You approve the course under internal learning."}
      </p>
      <CourseWorkshop certId={cert.id} courseName={cert.name} locale={locale} reviewer />
    </div>
  );
}
