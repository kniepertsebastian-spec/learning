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
    <Card className="mb-6" data-testid="progress-review">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-mint-text" aria-hidden="true" />
            {de ? "Dein Fortschritt" : "Your progress"}
          </h2>
          {review && (
            <p className="mt-1 text-sm" data-testid="progress-review-text">
              {de
                ? `Vor ${review.weeks} Wochen: ${review.then.secure} von ${review.then.total} Lernzielen sicher. Heute: ${review.now.secure}.`
                : `${review.weeks} weeks ago: ${review.then.secure} of ${review.then.total} objectives secure. Today: ${review.now.secure}.`}
            </p>
          )}
        </div>
        <Sparkline series={series} label={de ? "Sichere Lernziele über die Zeit" : "Secure objectives over time"} />
      </div>
      {outlook && (
        <p className="mt-3 text-sm" data-testid="exam-outlook">
          {outlook.status === "done"
            ? de ? "Du hast dein Ziel an sicheren Lernzielen für den Prüfungstermin schon erreicht." : "You have already reached your goal of secure objectives for the exam date."
            : outlook.status === "on_track"
              ? de ? `Du bist auf Kurs: Bei deinem Tempo erwarten wir bis zum Prüfungstermin etwa ${outlook.projected} sichere Lernziele (Ziel: ${outlook.target}).` : `You are on track: at your pace we expect about ${outlook.projected} secure objectives by the exam date (goal: ${outlook.target}).`
              : de ? `Bei deinem Tempo wird es bis zum Prüfungstermin knapp: etwa ${outlook.projected} sichere Lernziele erwartet, Ziel ${outlook.target}. Sollen wir den Plan anpassen?` : `At your pace it will be tight by the exam date: about ${outlook.projected} secure objectives expected, goal ${outlook.target}. Shall we adjust the plan?`}
          {outlook.status === "tight" && (
            <span className="ml-1 inline-flex flex-wrap gap-3">
              <Link href="/how-i-learn" className="text-link hover:underline">{de ? "Wochenziel erhöhen" : "Raise weekly goal"}</Link>
              <Link href={`/cert/${certSlug}#study-goal`} className="text-link hover:underline">{de ? "Termin ändern" : "Change exam date"}</Link>
            </span>
          )}
        </p>
      )}
      <p className="mt-2 text-xs text-subtle">{de ? "Nur für dich sichtbar, ohne Vergleich mit anderen." : "Visible to you only, no comparison with others."}</p>
    </Card>
  );
}
