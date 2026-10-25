export const dynamic = "force-dynamic";

import Link from "next/link";
import { ReviewerProbe, type ProbeAttemptJson, type ProbeOverviewJson } from "@/components/reviewer/ReviewerProbe";
import { getServerLocale } from "@/lib/server/locale";
import { requireReviewerPage } from "@/lib/server/reviewers/guard";
import { getAttemptView, getProbeOverview } from "@/lib/server/reviewers/probe-service";

/** Probe-Review für neue Prüfer (Voraussetzung für Freigaben und das öffentliche Profil). */
export default async function ReviewerProbePage() {
  const user = await requireReviewerPage("/reviewer/probe");
  const locale = await getServerLocale();
  const de = locale === "de";
  const overview = await getProbeOverview(user.id);
  const view = overview.openAttemptId ? await getAttemptView(user.id, overview.openAttemptId) : null;
  const overviewJson: ProbeOverviewJson = { ...overview, blockedUntil: overview.blockedUntil ? overview.blockedUntil.toISOString() : null };
  const attempt: ProbeAttemptJson | null = view ? { id: view.id, title: view.title, topic: view.topic, items: view.items, reports: view.reports } : null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/reviewer" className="text-sm text-link hover:underline">← {de ? "Mein Kurs" : "My course"}</Link>
        <h1 className="mt-2 text-2xl font-semibold">{de ? "Probe-Review" : "Trial review"}</h1>
      </div>
      <ReviewerProbe overview={overviewJson} attempt={attempt} locale={locale} />
    </div>
  );
}
