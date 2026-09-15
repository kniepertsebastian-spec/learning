export const dynamic = "force-dynamic";

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
        <p className="text-foreground/70">
          {locale === "de" ? "Bitte melde dich an." : "Please sign in."}
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

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href={`/cert/${slug}`}
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {locale === "de" ? "Zurück zur Zertifizierung" : "Back to certification"}
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">
        {locale === "de" ? "Offline verfügbar" : "Available offline"}
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
