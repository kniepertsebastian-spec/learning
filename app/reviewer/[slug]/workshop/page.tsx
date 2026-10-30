export const dynamic = "force-dynamic";

import { c_reviewerSlugWorkshopPage } from "@/lib/i18n/components/reviewerSlugWorkshopPage";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { CourseWorkshop } from "@/components/admin/workshop/CourseWorkshop";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { requireReviewerPage } from "@/lib/server/reviewers/guard";
import { canReviewCourse } from "@/lib/server/reviewers/service";

/**
 * Bearbeiten für Prüfer (roadmap_bugs_features 3.1): Lektionen anlegen, ändern und löschen, Simulationen im Lektionstext
 * und alle Fragen (Fragenpools, Einstufungstest, Abschlussprüfung) von Hand bearbeiten. Nur im zugewiesenen Kurs, ohne KI.
 */
export default async function ReviewerWorkshopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireReviewerPage(`/reviewer/${slug}/workshop`);
  const locale = await getServerLocale();
  const de = locale === "de";
  const [cert] = await getDb().select({ id: certifications.id, name: certifications.name }).from(certifications).where(eq(certifications.slug, slug)).limit(1);
  // Nicht zugewiesene und interne Kurse sehen aus wie nicht vorhanden.
  if (!cert || !(await canReviewCourse(user.id, cert.id))) notFound();
  return (
    <div className="flex flex-1 flex-col" data-testid="reviewer-workshop-page">
      <Link href={`/reviewer/${slug}`} className="mb-4 flex w-fit items-center gap-1.5 text-sm text-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {c_reviewerSlugWorkshopPage(de).backToTheCourseView}
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">{c_reviewerSlugWorkshopPage(de).editCourse}: {cert.name}</h1>
      <p className="mb-6 text-sm text-subtle">
        {c_reviewerSlugWorkshopPage(de).changesAreVisibleToLearners}
      </p>
      <CourseWorkshop certId={cert.id} courseName={cert.name} locale={locale} reviewer />
    </div>
  );
}
