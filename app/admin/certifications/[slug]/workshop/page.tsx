export const dynamic = "force-dynamic";

import { c_adminCertificationsSlugWorkshopPage } from "@/lib/i18n/components/adminCertificationsSlugWorkshopPage";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { CourseApprovalPanel } from "@/components/admin/CourseApprovalPanel";
import { CourseWorkshop } from "@/components/admin/workshop/CourseWorkshop";

/** Kurs-Werkstatt (roadmap3.md, Schritt 1): Lektionen und Fragen eines allgemeinen Kurses bearbeiten, mit Versionen. */
export default async function CourseWorkshopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireAdminPage(`/admin/certifications/${slug}/workshop`);
  const locale = await getServerLocale();
  const de = locale === "de";
  const [cert] = await getDb().select({ id: certifications.id, name: certifications.name, kind: certifications.kind }).from(certifications).where(eq(certifications.slug, slug)).limit(1);
  return (
    <div className="flex flex-1 flex-col">
      <Link href={`/admin/certifications/${slug}`} className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {c_adminCertificationsSlugWorkshopPage(de).backToCourseAdmin}
      </Link>
      {!cert || cert.kind !== "general" ? (
        <p className="text-muted">{c_adminCertificationsSlugWorkshopPage(de).courseNotFoundCompanyInternal}</p>
      ) : (
        <>
          <h1 className="mb-1 text-2xl font-semibold">{c_adminCertificationsSlugWorkshopPage(de).editCourse}: {cert.name}</h1>
          <p className="mb-6 text-sm text-subtle">{c_adminCertificationsSlugWorkshopPage(de).changesAreVisibleToLearners}</p>
          <CourseApprovalPanel certId={cert.id} locale={locale} />
          <CourseWorkshop certId={cert.id} courseName={cert.name} locale={locale} />
        </>
      )}
    </div>
  );
}
