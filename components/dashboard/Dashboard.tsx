"use client";

import { ArrowRight, Flame } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Overline } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar, ProgressRing } from "@/components/ui/progress";
import { StatTile } from "@/components/ui/stat-tile";
import { cn } from "@/lib/cn";
import { greetingPart, type CertState, type DomainLight } from "@/lib/dashboard/logic";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { CourseCategoryColor } from "@/lib/server/db/schema";

export interface DashboardData {
  name: string;
  certs: Array<{ id: string; slug: string; name: string; version: string; shortCode: string; color: CourseCategoryColor; doneLessons: number; totalLessons: number; percent: number; state: CertState; examInDays: number | null }>;
  main: null | {
    certSlug: string;
    certName: string;
    examInDays: number | null;
    readiness: { score: number | null };
    domains: Array<{ name: string; light: DomainLight; percent: number }>;
    recommendation: null | { objectiveId: string; objectiveTitle: string; domainName: string };
    dueCount: number;
  };
  hero: null | { certSlug: string; certName: string; domainName: string; sectionId: string; sectionTitle: { de: string; en: string }; position: number; total: number; percent: number; lastAtIso: string | null };
  dueTotal: number;
  /** Nach einer Pause von mindestens 7 Tagen: Begrüßung statt Rückstand-Zahl. */
  welcomeBack?: boolean;
  streak: number;
  stats: { answeredTotal: number; answeredWeek: number; accuracyWeek: number | null; accuracyDelta: number | null; lessonsDone: number; lessonsDoneWeek: number };
  week: { counts: number[]; todayIndex: number; activeDays: number; plannedDays: number };
}

const TILE_COLOR: Record<CourseCategoryColor, string> = { info: "bg-info-soft text-info-text", mint: "bg-mint-soft text-mint-text", warning: "bg-warning-soft text-warning-text", danger: "bg-danger-soft text-danger-text", violet: "bg-surface-2 text-violet" };
const LIGHT_DOT: Record<DomainLight, string> = { strong: "bg-mint", practice: "bg-warning", weak: "bg-danger" };
/** Geschätzte Minuten je fälliger Karte (Richtwert, kein gemessener Wert). */
const MINUTES_PER_CARD = 0.6;

const noopSubscribe = () => () => {};
/** Tageszeit aus der Browseruhr; auf dem Server `null` (neutrale Begrüßung), danach ohne Zwischenzustand. */
function useGreetingPart(): ReturnType<typeof greetingPart> | null {
  return useSyncExternalStore(noopSubscribe, () => greetingPart(new Date().getHours()), () => null);
}

function ago(iso: string | null, t: ReturnType<typeof useLocale>["t"]): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t.home.justNow;
  if (mins < 60) return fmt(t.home.minutesAgo, { n: mins });
  if (mins < 60 * 24) return fmt(t.home.hoursAgo, { n: Math.round(mins / 60) });
  return fmt(t.home.daysAgo, { n: Math.round(mins / 1440) });
}

export function Dashboard({ data }: { data: DashboardData }) {
  const { locale, t } = useLocale();
  const h = t.home;
  const part = useGreetingPart();
  const greeting = fmt(part === "morning" ? h.greetMorning : part === "evening" ? h.greetEvening : part === "day" ? h.greetDay : h.greetHello, { name: data.name });
  const dueMinutes = Math.max(1, Math.round(data.dueTotal * MINUTES_PER_CARD));
  const examLine = data.main && data.main.examInDays !== null && data.main.examInDays >= 0 ? ` ${fmt(h.examLine, { name: data.main.certName, n: data.main.examInDays })}` : "";
  // Nach längerer Pause keine Rückstand-Zahl: „Willkommen zurück – heute nur 5 Minuten“, der Rest wird über die nächsten Tage verteilt.
  const welcomeBack = Boolean(data.welcomeBack) && data.dueTotal > 0;
  const dueLine = welcomeBack ? h.welcomeBackLine : data.dueTotal > 0 ? fmt(h.dueLine, { n: data.dueTotal, m: dueMinutes }) : h.noDueLine;
  const stateText = (c: DashboardData["certs"][number]) => ({ planned: fmt(h.pillPlanned, { n: c.examInDays ?? 0 }), started: h.pillStarted, not_started: h.pillNotStarted, completed: h.pillCompleted })[c.state];
  const stateTone = (s: CertState) => (s === "planned" || s === "completed" ? "mint" : s === "started" ? "info" : "neutral");
  const btnText = (s: CertState) => (s === "not_started" ? h.btnStart : s === "completed" ? h.btnRepeat : h.btnContinue);
  const dayNames = h.days.split(",");
  const maxBar = Math.max(1, ...data.week.counts);

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[34px]" data-testid="greeting">{greeting}</h1>
        <p className="mt-1.5 text-[15px] text-subtle">{dueLine}{examLine}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card variant="hero" className="lg:col-span-2" data-testid="hero">
          {data.hero ? (
            <>
              <Overline className="text-mint-text">{h.resume}{ago(data.hero.lastAtIso, t) ? ` · ${fmt(h.lastAgo, { when: ago(data.hero.lastAtIso, t) ?? "" })}` : ""}</Overline>
              <p className="mt-2 text-sm text-muted">{data.hero.certName} · {data.hero.domainName}</p>
              <h2 className="mt-1 text-2xl leading-tight font-semibold tracking-tight">{data.hero.sectionTitle[locale]}</h2>
              <div className="mt-4 max-w-[520px]">
                <div className="mb-1.5 flex justify-between text-xs text-subtle tabular-nums">
                  <span>{fmt(h.sectionXofY, { x: data.hero.position, y: data.hero.total })}</span>
                  <span>{data.hero.percent} %</span>
                </div>
                <ProgressBar value={data.hero.percent} size="lg" tone="mint" label={h.resume} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/cert/${data.hero.certSlug}/section/${data.hero.sectionId}`} data-testid="hero-continue">{h.continueLearning}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                </Button>
                {data.main && data.main.dueCount > 0 && (
                  <Button asChild variant="secondary"><Link href={`/cert/${data.main.certSlug}/session`}>{welcomeBack ? h.reviewsSoft : fmt(h.reviews, { n: data.main.dueCount })}</Link></Button>
                )}
              </div>
            </>
          ) : (
            <>
              <Overline className="text-mint-text">{h.resume}</Overline>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{h.startFirst}</h2>
              <p className="mt-1 max-w-md text-sm text-muted">{h.startFirstBody}</p>
              <Button asChild className="mt-5"><Link href="/catalog" data-testid="hero-catalog">{h.browseCatalog}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
            </>
          )}
        </Card>

        <Card data-testid="readiness-card">
          <Overline>{h.readiness}</Overline>
          {data.main ? (
            <>
              <div className="mt-3 flex items-center gap-4">
                {data.main.readiness.score !== null ? (
                  <ProgressRing value={data.main.readiness.score} caption={t.quiz.outOf} label={`${h.readiness}: ${data.main.readiness.score}`} />
                ) : (
                  <p className="flex h-[132px] w-[132px] items-center justify-center rounded-full border-2 border-dashed border-border-strong p-3 text-center text-xs text-subtle">{h.readinessUnknown}</p>
                )}
                <ul className="flex min-w-0 flex-1 flex-col gap-2">
                  {data.main.domains.map((d) => (
                    <li key={d.name} className="flex items-center gap-2 text-sm">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", LIGHT_DOT[d.light])} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <span className="shrink-0 text-xs text-faint">{{ strong: h.lightStrong, practice: h.lightPractice, weak: h.lightWeak }[d.light]}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3 text-sm">
                {data.main.examInDays !== null && data.main.examInDays >= 0 ? (
                  <>
                    <span>{fmt(h.examIn, { n: data.main.examInDays })}</span>
                    <Link href={`/cert/${data.main.certSlug}/final-exam`} className="font-medium text-link hover:underline">{h.simulate}</Link>
                  </>
                ) : (
                  <Link href={`/cert/${data.main.certSlug}`} className="font-medium text-link hover:underline">{h.planExam}</Link>
                )}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-subtle">{h.readinessUnknown}</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="stat-tiles">
        <StatTile label={h.statAnswered} value={data.stats.answeredTotal} sub={fmt(h.statAnsweredSub, { n: data.stats.answeredWeek })} subTone="accent" />
        <StatTile
          label={h.statAccuracy}
          value={data.stats.accuracyWeek === null ? "–" : `${data.stats.accuracyWeek} %`}
          sub={data.stats.accuracyWeek === null ? h.statAccuracyNone : data.stats.accuracyDelta === null ? undefined : fmt(h.statAccuracySub, { n: `${data.stats.accuracyDelta > 0 ? "+" : ""}${data.stats.accuracyDelta}` })}
          subTone={data.stats.accuracyDelta !== null && data.stats.accuracyDelta < 0 ? "warning" : "accent"}
        />
        <StatTile label={h.statDue} value={welcomeBack ? "–" : data.dueTotal} sub={welcomeBack ? h.statDueSpread : data.dueTotal > 0 ? fmt(h.statDueSub, { m: dueMinutes }) : undefined} subTone="warning" />
        <StatTile label={h.statLessons} value={data.stats.lessonsDone} sub={fmt(h.statLessonsSub, { n: data.stats.lessonsDoneWeek })} subTone="accent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-label={h.myCerts}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{h.myCerts}</h2>
            <Link href="/catalog" className="text-sm font-medium text-link hover:underline">{h.browseCatalog}</Link>
          </div>
          {data.certs.length === 0 ? (
            <EmptyState title={h.startFirst} description={h.startFirstBody} action={<Button asChild size="sm"><Link href="/catalog">{h.browseCatalog}</Link></Button>} />
          ) : (
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
              {data.certs.map((c) => (
                <li key={c.id}>
                  <Card className="flex h-full flex-col gap-3" data-testid={`cert-card-${c.slug}`}>
                    <div className="flex items-start gap-3">
                      <span className={cn("flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl font-mono text-[13px] font-semibold", TILE_COLOR[c.color])} aria-hidden="true">{c.shortCode}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{c.name}</p>
                        <p className="font-mono text-[11.5px] text-subtle">{c.version}</p>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-xs text-subtle tabular-nums">
                        <span>{fmt(h.lessonsXofY, { x: c.doneLessons, y: c.totalLessons })}</span>
                        <span>{c.percent} %</span>
                      </div>
                      <ProgressBar value={c.percent} tone="mint" label={c.name} />
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <Badge tone={stateTone(c.state)}>{stateText(c)}</Badge>
                      <Button asChild size="sm" variant={c.state === "not_started" ? "primary" : "secondary"}><Link href={`/cert/${c.slug}`}>{btnText(c.state)}</Link></Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Card className="h-fit" data-testid="week-card">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{h.thisWeek}</h2>
            {data.streak > 0 && <Badge tone="warning"><Flame className="h-3.5 w-3.5" aria-hidden="true" />{fmt(h.streakNote, { n: data.streak })}</Badge>}
          </div>
          <div className="mt-4 flex h-24 items-end gap-2" role="img" aria-label={data.week.counts.map((n, i) => `${dayNames[i]} ${n}`).join(", ")}>
            {data.week.counts.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-16 w-full items-end rounded-md bg-track">
                  <div className={cn("w-full rounded-md", i === data.week.todayIndex ? "bg-mint" : "bg-subtle")} style={{ height: `${n === 0 ? 0 : Math.max(8, Math.round((n / maxBar) * 100))}%` }} />
                </div>
                <span className={cn("text-[11px]", i === data.week.todayIndex ? "font-semibold text-foreground" : "text-faint")}>{dayNames[i]}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-subtle">
              <span>{h.weekGoal}</span>
              <span className="tabular-nums">{fmt(h.weekGoalOf, { x: data.week.activeDays, y: data.week.plannedDays })}</span>
            </div>
            <ProgressBar value={(data.week.activeDays / data.week.plannedDays) * 100} tone="mint" label={h.weekGoal} />
          </div>
          <div className="mt-4 rounded-xl border border-border-subtle bg-surface-inset p-3">
            <Overline>{h.recommendation}</Overline>
            {data.main?.recommendation ? (
              <>
                <p className="mt-1.5 text-sm">{data.main.recommendation.objectiveTitle}</p>
                <p className="text-xs text-faint">{data.main.recommendation.domainName}</p>
                <Link href={`/cert/${data.main.certSlug}/remediation/${data.main.recommendation.objectiveId}`} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-link hover:underline" data-testid="close-gap">{h.closeGap}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
              </>
            ) : (
              <p className="mt-1.5 text-sm text-subtle">{h.noRecommendation}</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
