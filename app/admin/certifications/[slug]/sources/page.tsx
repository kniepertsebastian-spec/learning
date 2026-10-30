export const dynamic = "force-dynamic";

import { c_adminCertificationsSlugSourcesPage } from "@/lib/i18n/components/adminCertificationsSlugSourcesPage";
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
          className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {c_adminCertificationsSlugSourcesPage(locale).backToAdminDashboard}
        </Link>
        <p className="text-muted">
          {c_adminCertificationsSlugSourcesPage(locale).certificationNotFound}
        </p>
      </div>
    );
  }

  const sources = await listCertificationSources(cert.id);

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href={`/admin/certifications/${slug}`}
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {cert.name}
      </Link>

      <h1 className="mb-1 text-2xl font-semibold">
        {c_adminCertificationsSlugSourcesPage(locale).officialSources}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {c_adminCertificationsSlugSourcesPage(locale).uploadOfficialExamDocumentationAs}
      </p>

      <SourcesManager
        certificationId={cert.id}
        certificationSlug={slug}
        locale={locale}
        initialSources={sources}
      />
    </div>
  );
}
