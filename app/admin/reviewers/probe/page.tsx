export const dynamic = "force-dynamic";

import Link from "next/link";
import { ProbeAdmin } from "@/components/admin/ProbeAdmin";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";
import { listProbeAttemptsForAdmin, listProbeSets, listReviewerQualifications } from "@/lib/server/reviewers/probe-service";

/** Betreiber: Probe-Review für neue Prüfer (Sätze mit eingebauten Fehlern, Ergebnisse, Freischaltung). */
export default async function AdminProbePage() {
  await requireAdminPage("/admin/reviewers/probe");
  const locale = await getServerLocale();
  const [sets, attempts, qualifications] = await Promise.all([listProbeSets(), listProbeAttemptsForAdmin(), listReviewerQualifications()]);
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <Link href="/admin/reviewers" className="text-sm text-link hover:underline">← {locale === "de" ? "Fachliche Prüfer" : "Expert reviewers"}</Link>
        <h1 className="mt-2 text-2xl font-semibold">{locale === "de" ? "Probe-Review" : "Trial review"}</h1>
      </div>
      <ProbeAdmin
        locale={locale}
        sets={sets}
        attempts={attempts.map((a) => ({ id: a.id, reviewerName: a.reviewerName, setTitle: a.setTitle, submittedAt: a.submittedAt.toISOString(), result: a.result, extraNotes: a.extraNotes }))}
        qualifications={qualifications.map((q) => ({ userId: q.userId, email: q.email, name: q.name, qualified: q.qualified, source: q.source }))}
      />
    </div>
  );
}
