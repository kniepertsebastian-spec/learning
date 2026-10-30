export const dynamic = "force-dynamic";

import { c_adminCertificationsSlugSourcesSourceIdReviewPage } from "@/lib/i18n/components/adminCertificationsSlugSourcesSourceIdReviewPage";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { getCertificationSource, getSourcePages } from "@/lib/server/admin/sources";
import { getBlueprintDraft } from "@/lib/server/admin/blueprint";
import type { BlueprintExtraction } from "@/lib/server/ai/service";
import { BlueprintReview } from "@/components/BlueprintReview";

export default async function BlueprintReviewPage({
  params,
}: {
  params: Promise<{ slug: string; sourceId: string }>;
}) {
  const { slug, sourceId } = await params;
  await requireAdminPage(`/admin/certifications/${slug}/sources/${sourceId}/review`);
  const locale = await getServerLocale();

  const [cert] = await getDb()
    .select()
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);

  const backLink = `/admin/certifications/${slug}/sources`;

  if (!cert) {
    return (
      <div className="flex flex-1 flex-col">
        <Link href="/admin" className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {c_adminCertificationsSlugSourcesSourceIdReviewPage(locale).backToAdminDashboard}
        </Link>
        <p className="text-muted">{c_adminCertificationsSlugSourcesSourceIdReviewPage(locale).certificationNotFound}</p>
      </div>
    );
  }

  const source = await getCertificationSource(sourceId);
  if (!source || source.certificationId !== cert.id) {
    return (
      <div className="flex flex-1 flex-col">
        <Link href={backLink} className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {c_adminCertificationsSlugSourcesSourceIdReviewPage(locale).backToSources}
        </Link>
        <p className="text-muted">{c_adminCertificationsSlugSourcesSourceIdReviewPage(locale).sourceNotFound}</p>
      </div>
    );
  }

  const [draft, pages] = await Promise.all([
    getBlueprintDraft(sourceId),
    getSourcePages(sourceId),
  ]);

  if (!draft) {
    return (
      <div className="flex flex-1 flex-col">
        <Link href={backLink} className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {c_adminCertificationsSlugSourcesSourceIdReviewPage(locale).backToSources}
        </Link>
        <p className="text-muted">
          {c_adminCertificationsSlugSourcesSourceIdReviewPage(locale).noBlueprintProposalForThis}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <Link href={backLink} className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {source.title}
      </Link>

      <h1 className="mb-1 text-2xl font-semibold">
        {c_adminCertificationsSlugSourcesSourceIdReviewPage(locale).reviewAndApproveBlueprint}
      </h1>
      <p className="mb-6 text-sm text-muted">{cert.name}</p>

      <BlueprintReview
        sourceId={sourceId}
        locale={locale}
        initialStatus={source.status}
        supersedesSourceId={source.supersedesSourceId}
        initialPages={pages}
        initialDraft={{
          content: draft.content as unknown as BlueprintExtraction,
          suggestedSlug: draft.suggestedSlug,
          warnings: draft.warnings,
          validationErrors: draft.validationErrors,
          truncatedSource: draft.truncatedSource,
          confirmedLowConfidenceObjectives: draft.confirmedLowConfidenceObjectives,
        }}
      />
    </div>
  );
}
