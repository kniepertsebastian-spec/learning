export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImpactReportPanel } from "@/components/admin/ImpactReportPanel";
import { c_adminImpactPage } from "@/lib/i18n/components/adminImpactPage";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";
import { getImpactReport } from "@/lib/server/psrp/impact";

/** Wirkung messen (docs/roadmaps/roadmap_didaktik.md, Phase 7): beschreibender Bericht für Admins, ohne automatische Folgen. */
export default async function AdminImpactPage() {
  await requireAdminPage("/admin/impact");
  const locale = await getServerLocale();
  const tx = c_adminImpactPage(locale);
  const report = await getImpactReport();
  return (
    <div className="flex flex-1 flex-col gap-4">
      <Link href="/admin/stats" className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {tx.back}
      </Link>
      <h1 className="text-2xl font-semibold tracking-title sm:text-title">{tx.title}</h1>
      <ImpactReportPanel report={report} locale={locale} />
    </div>
  );
}
