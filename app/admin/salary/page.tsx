export const dynamic = "force-dynamic";

import Link from "next/link";
import { SalaryImport } from "@/components/admin/SalaryImport";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";
import { listSalaryDatasets } from "@/lib/server/salary/service";

/** Gehaltsdaten: Tabelle der Entgeltstatistik der Bundesagentur für Arbeit hochladen; Grundlage der Gehaltsangaben bei den Karrierepfaden. */
export default async function AdminSalaryPage() {
  await requireAdminPage("/admin/salary");
  const locale = await getServerLocale();
  const datasets = await listSalaryDatasets();
  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="admin-salary">
      <div>
        <Link href="/admin" className="text-sm text-link hover:underline">
          ← Admin
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{locale === "de" ? "Gehaltsdaten" : "Salary data"}</h1>
      </div>
      <SalaryImport locale={locale} datasets={datasets.map((d) => ({ ...d, importedAt: d.importedAt.toISOString() }))} />
    </div>
  );
}
