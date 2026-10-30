import { c_progressReviewCard } from "@/lib/i18n/components/progressReviewCard";
import { fill } from "@/lib/i18n/fill";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Outlook, ProgressReview, SnapshotPoint } from "@/lib/progress/forecast";

const W = 160;
const H = 36;

/** Kleine Grafik „Lernziele sicher über die Zeit“, nur aus echten Ständen. */
function Sparkline({ series, label }: { series: SnapshotPoint[]; label: string }) {
  if (series.length < 2) return null;
  const max = Math.max(1, ...series.map((p) => p.total));
  const x = (i: number) => (i / (series.length - 1)) * (W - 4) + 2;
  const y = (v: number) => H - 3 - (v / max) * (H - 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} className="text-mint-text" data-testid="progress-sparkline">
      <polyline points={series.map((p, i) => `${x(i).toFixed(1)},${y(p.secure).toFixed(1)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * „Fortschritt sichtbar“: Rückblick („Vor 3 Wochen: 2 von 12 Lernzielen sicher. Heute: 9.“) und Einschätzung zum Prüfungstermin.
 * Nur echte Werte aus gespeicherten Ständen, kein Vergleich mit anderen, nur für die Person selbst (nie im Firmenbereich).
 */
export function ProgressReviewCard({ review, outlook, series, locale, certSlug }: { review: ProgressReview | null; outlook: Outlook; series: SnapshotPoint[]; locale: "de" | "en"; certSlug: string }) {
  if (!review && !outlook) return null;
  const de = locale === "de";
  return (
    <Card data-testid="progress-review">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-mint-text" aria-hidden="true" />
            {c_progressReviewCard(de).yourProgress}
          </h2>
          {review && (
            <p className="mt-1 text-sm" data-testid="progress-review-text">
              {fill(c_progressReviewCard(de).n0WeeksAgo1Of, review.weeks, review.then.secure, review.then.total, review.now.secure)}
            </p>
          )}
        </div>
        <Sparkline series={series} label={c_progressReviewCard(de).secureObjectivesOverTime} />
      </div>
      {outlook && (
        <p className="mt-3 text-sm" data-testid="exam-outlook">
          {outlook.status === "done"
            ? c_progressReviewCard(de).youHaveAlreadyReachedYour
            : outlook.status === "on_track"
              ? fill(c_progressReviewCard(de).youAreOnTrackAt, outlook.projected, outlook.target)
              : fill(c_progressReviewCard(de).atYourPaceItWill, outlook.projected, outlook.target)}
          {outlook.status === "tight" && (
            <span className="ml-1 inline-flex flex-wrap gap-3">
              <Link href="/how-i-learn" className="text-link hover:underline">{c_progressReviewCard(de).raiseWeeklyGoal}</Link>
              <Link href={`/cert/${certSlug}#study-goal`} className="text-link hover:underline">{c_progressReviewCard(de).changeExamDate}</Link>
            </span>
          )}
        </p>
      )}
      <p className="mt-2 text-xs text-subtle">{c_progressReviewCard(de).visibleToYouOnlyNo}</p>
    </Card>
  );
}
