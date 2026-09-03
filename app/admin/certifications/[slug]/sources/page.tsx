export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { listCertificationSources } from "@/lib/server/admin/sources";
import { SourcesManager } from "@/components/SourcesManager";

export default async function AdminCertificationSourcesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(`/admin/certifications/${slug}/sources`);
  const locale = await getServerLocale();

  const [cert] = await getDb()
    .select()
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);

  if (!cert) {
    return (
      <div className="flex flex-1 flex-col">
        <Link
          href="/admin"
          className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {locale === "de" ? "Zurück zum Admin-Dashboard" : "Back to admin dashboard"}
        </Link>
        <p className="text-foreground/70">
          {locale === "de" ? "Zertifizierung nicht gefunden" : "Certification not found"}
        </p>
      </div>
    );
  }

  const sources = await listCertificationSources(cert.id);

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href={`/admin/certifications/${slug}`}
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {cert.name}
      </Link>

      <h1 className="mb-1 text-2xl font-semibold">
        {locale === "de" ? "Offizielle Quellen" : "Official sources"}
      </h1>
      <p className="mb-6 text-sm text-foreground/70">
        {locale === "de"
          ? "Offizielle Prüfungsunterlagen als PDF hochladen und ihren Text extrahieren. Quelle der Wahrheit für Domains, Objectives und Lernmaterial (R1)."
          : "Upload official exam documentation as PDF and extract its text. Source of truth for domains, objectives, and learning material (R1)."}
      </p>

      <SourcesManager certificationId={cert.id} locale={locale} initialSources={sources} />
    </div>
  );
}
