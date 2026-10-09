export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/server/auth-guards";
import { getCatalogOverview } from "@/lib/server/admin/catalog-overview";
import { AdminCatalog } from "@/components/admin/AdminCatalog";

export default async function AdminDashboard() {
  await requireAdminPage("/admin");
  const overview = await getCatalogOverview();

  return (
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
        stats: { domains: c.stats.domains, lessons: c.stats.lessons, questions: c.stats.questions },
      }))}
      groups={overview.categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      totals={{ lessons: overview.totals.lessons, questions: overview.totals.questions }}
      openRequests={overview.openRequests}
      openReports={overview.openReports}
      aiCostMonthUsd={overview.aiCostMonthUsd}
    />
  );
}
