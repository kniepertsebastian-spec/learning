export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/server/auth-guards";
import { getCatalogOverview } from "@/lib/server/admin/catalog-overview";
import { AdminCatalog } from "@/components/admin/AdminCatalog";
import { AdminAiBatches } from "@/components/admin/AdminAiBatches";
import { getServerLocale } from "@/lib/server/locale";
import { isCourseTranslationActive } from "@/lib/server/course-translation/runner";

export default async function AdminDashboard() {
  await requireAdminPage("/admin");
  const [overview, locale] = await Promise.all([getCatalogOverview(), getServerLocale()]);

  return (
    <>
    <AdminAiBatches locale={locale} />
    <AdminCatalog
      certs={overview.certifications.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        provider: c.provider,
        examVersion: c.examVersion,
        courseType: c.courseType,
        categoryId: c.categoryId,
        categoryIds: c.categoryIds,
        shortCode: c.shortCode,
        translation: {
          contentLocale: c.translation.contentLocale ?? "de",
          // Ein „laufender“ Lauf ohne aktiven Prozess ging durch einen Neustart verloren.
          status: c.translation.status === "running" && !isCourseTranslationActive(c.id) ? "interrupted" : c.translation.status,
          message: c.translation.message,
          processed: c.translation.processed,
          total: c.translation.total,
        },
        stats: { domains: c.stats.domains, lessons: c.stats.lessons, questions: c.stats.questions },
      }))}
      groups={overview.categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      totals={{ lessons: overview.totals.lessons, questions: overview.totals.questions }}
      openRequests={overview.openRequests}
      openReports={overview.openReports}
      aiCostMonthUsd={overview.aiCostMonthUsd}
    />
    </>
  );
}
