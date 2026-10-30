export const dynamic = "force-dynamic";

import { c_certIdOfflinePage } from "@/lib/i18n/components/certIdOfflinePage";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { OfflinePackageManager } from "@/components/OfflinePackageManager";

/** R4.1 (roadmap.md): "Für offline speichern" pro Kurs - eigene Route mit
 * Download-/Speicherverwaltung und Offline-Lesern für die Lessons/Quizze
 * dieses Kurses. */
export default async function OfflinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
  const [session, locale] = await Promise.all([auth(), getServerLocale()]);

  if (!session?.user?.id) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-muted">
          {c_certIdOfflinePage(locale).pleaseSignIn}
        </p>
      </div>
    );
  }

  const [cert] = await getDb()
    .select()
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);
  if (!cert) notFound();
  if (!cert.includeSectionQuizzes) notFound(); // der Offline-Leser ist auf Lernpfade mit Lektionstests ausgelegt

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href={`/cert/${slug}`}
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {c_certIdOfflinePage(locale).backToCertification}
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">
        {c_certIdOfflinePage(locale).availableOffline}
      </h1>

      <OfflinePackageManager
        certificationId={cert.id}
        certSlug={slug}
        certName={cert.name}
        userId={session.user.id}
        locale={locale}
      />
    </div>
  );
}
