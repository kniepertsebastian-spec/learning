export const dynamic = "force-dynamic";

import { AdminRequestsPanel } from "@/components/AdminRequestsPanel";
import { listAllCourseRequests, listCatalog, listEntitlements } from "@/lib/server/admin/course-requests";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";

/** Betreiber: Kundenanfragen bearbeiten (freigeben, Stand setzen) und den Prüfstatus der Lernpfade pflegen. */
export default async function AdminRequestsPage() {
  await requireAdminPage("/admin/requests");
  const locale = await getServerLocale();
  const [requests, catalog, entitlements] = await Promise.all([listAllCourseRequests(), listCatalog(), listEntitlements()]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-title sm:text-title">{locale === "de" ? "Kundenanfragen und Lernpfad-Freigaben" : "Customer requests and course releases"}</h1>
      </div>
      <AdminRequestsPanel
        locale={locale}
        requests={requests.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }))}
        entitlements={entitlements.map((e) => ({ ...e, releasedAt: e.releasedAt.toISOString() }))}
        catalog={catalog.map((c) => ({ ...c, approvedAt: c.approvedAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
