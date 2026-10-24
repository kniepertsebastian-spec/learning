export const dynamic = "force-dynamic";

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
      <Link href={`/admin/certifications/${slug}`} className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {de ? "Zurück zur Kursverwaltung" : "Back to course admin"}
      </Link>
      {!cert || cert.kind !== "general" ? (
        <p className="text-foreground/70">{de ? "Kurs nicht gefunden (interne Kurse einer Firma werden hier nicht bearbeitet)." : "Course not found (company-internal courses aren't edited here)."}</p>
      ) : (
        <>
          <h1 className="mb-1 text-2xl font-semibold">{de ? "Kurs bearbeiten" : "Edit course"}: {cert.name}</h1>
          <p className="mb-6 text-sm text-subtle">{de ? "Änderungen sind sofort für Lernende sichtbar. Jeder frühere Stand bleibt in den Versionen erhalten." : "Changes are visible to learners immediately. Every earlier version stays in the history."}</p>
          <CourseApprovalPanel certId={cert.id} locale={locale} />
          <CourseWorkshop certId={cert.id} courseName={cert.name} locale={locale} />
        </>
      )}
    </div>
  );
}
