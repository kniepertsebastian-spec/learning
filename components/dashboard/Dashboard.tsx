"use client";

import { CourseSeal } from "@/components/seal/CourseSeal";
import type { Seal } from "@/lib/reviewers/seal";
import { ProgressReviewCard } from "@/components/ProgressReviewCard";
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Clock, Flame, MessageSquare, Minus, Play, Target, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Overline } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar, ProgressRing } from "@/components/ui/progress";
import { SegmentedControl } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { greetingPart, monthGrid, type CertState, type DomainLight } from "@/lib/dashboard/logic";
import { useLocale } from "@/lib/i18n";
import { InstallBanner } from "@/components/InstallBanner";
import { fmt } from "@/lib/quiz/keys";
import type { CourseCategoryColor } from "@/lib/server/db/schema";
import type { ReadinessLevel } from "@/lib/server/readiness/engine";
import type { Localized } from "@/lib/types";

export type OpenItem =
  | { kind: "assignment"; name: string; slug: string; dueIso: string | null }
  | { kind: "practice"; count: number }
  | { kind: "mentor"; topic: string; answered: boolean; note: string | null };

export interface DashboardData {
  name: string;
  certs: Array<{ id: string; slug: string; name: string; version: string; shortCode: string; color: CourseCategoryColor; doneLessons: number; totalLessons: number; percent: number; state: CertState; examInDays: number | null; assigned?: boolean; seal?: Seal | null }>;
  main: null | {
    certSlug: string;
    certName: string;
    examInDays: number | null;
    readiness: { score: number | null; level: ReadinessLevel; coverage: number };
    domains: Array<{ name: string; light: DomainLight; percent: number }>;
    recommendation: null | { objectiveId: string; objectiveTitle: string; domainName: string };
    dueCount: number;
    progress?: import("@/lib/server/progress/snapshots").ProgressView | null;
  };
  hero: null | { certSlug: string; certName: string; domainName: string; sectionId: string; sectionTitle: { de: string; en: string }; position: number; total: number; percent: number; lastAtIso: string | null };
  dueTotal: number;
  /** Nach einer Pause von mindestens 7 Tagen: Begrüßung statt Rückstand-Zahl. */
  welcomeBack?: boolean;
  streak: number;
  stats: { answeredTotal: number; answeredWeek: number; accuracyWeek: number | null; accuracyDelta: number | null; lessonsDone: number; lessonsDoneWeek: number };
  week: { counts: number[]; todayIndex: number; activeDays: number; plannedDays: number };
  learningMinutesWeek: number | null;
  activeDays: string[];
  recent: Array<{ kind: "lesson"; atIso: string; certName: string; title: Localized<string> } | { kind: "exam"; atIso: string; certName: string; score: number | null; passed: boolean | null }>;
  /** Termine im Kalender: Prüfungstermine der Kurse und Fristen der Firma. */
  events: Array<{ kind: "exam" | "deadline"; name: string; dateIso: string; href: string }>;
  open: OpenItem[];
  nowIso: string;
}

const TILE_COLOR: Record<CourseCategoryColor, string> = { info: "bg-info-soft text-info-text", mint: "bg-success-soft text-success-text", warning: "bg-warning-soft text-warning-text", danger: "bg-danger-soft text-danger-text", violet: "bg-surface-2 text-violet" };
const LIGHT: Record<DomainLight, { bar: "success" | "warning" | "danger"; text: string; icon: LucideIcon }> = {
  strong: { bar: "success", text: "text-success-text", icon: Check },
  practice: { bar: "warning", text: "text-warning-text", icon: Minus },
  weak: { bar: "danger", text: "text-danger-text", icon: TriangleAlert },
};
const LEVEL: Record<ReadinessLevel, { key: "levelWell" | "levelAdequate" | "levelSomewhat" | "levelNeeds" | "levelInsufficient"; tone: "success" | "info" | "warning" | "danger" | "neutral" }> = {
  WELL_PREPARED: { key: "levelWell", tone: "success" },
  ADEQUATELY_PREPARED: { key: "levelAdequate", tone: "info" },
  SOMEWHAT_PREPARED: { key: "levelSomewhat", tone: "warning" },
  NEEDS_PREPARATION: { key: "levelNeeds", tone: "danger" },
  INSUFFICIENT_DATA: { key: "levelInsufficient", tone: "neutral" },
};
/** Geschätzte Minuten je fälliger Karte (Richtwert, kein gemessener Wert). */
const MINUTES_PER_CARD = 0.6;
const DAY = 86_400_000;

const noopSubscribe = () => () => {};
/** Tageszeit aus der Browseruhr; auf dem Server `null` (neutrale Begrüßung), danach ohne Zwischenzustand. */
function useGreetingPart(): ReturnType<typeof greetingPart> | null {
  return useSyncExternalStore(noopSubscribe, () => greetingPart(new Date().getHours()), () => null);
}

type T = ReturnType<typeof useLocale>["t"];

function ago(iso: string | null, nowIso: string, t: T): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t.home.justNow;
  if (mins < 60) return fmt(t.home.minutesAgo, { n: mins });
  if (mins < 60 * 24) return fmt(t.home.hoursAgo, { n: Math.round(mins / 60) });
  return fmt(t.home.daysAgo, { n: Math.round(mins / 1440) });
}

function minutesText(m: number, t: T): string {
  return m >= 60 ? fmt(t.home.hoursMinutes, { h: Math.floor(m / 60), m: m % 60 }) : fmt(t.home.minutesOnly, { m });
}

function IconTile({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]", className)} aria-hidden="true">
      <Icon className="h-4 w-4" strokeWidth={2} />
    </span>
  );
}

/** „Kurs abbrechen“: nimmt den Kurs aus dem Dashboard, der Fortschritt bleibt. Von der Firma zugewiesene Kurse haben den Knopf nicht. */
function AbandonCourseButton({ certId, name }: { certId: string; name: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function abandon() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/courses/${certId}/abandon`, { method: "POST" });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      setOpen(false);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="abandon-course" className="text-xs text-subtle underline-offset-2 hover:text-foreground hover:underline">
        {t.home.abandonCourse}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t.quiz.close}>
          <DialogTitle>{t.home.abandonTitle}</DialogTitle>
          <DialogDescription>{fmt(t.home.abandonConfirm, { name })}</DialogDescription>
          {failed && <p role="alert" className="mt-3 text-sm text-danger-text">{t.home.abandonFailed}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t.home.abandonKeep}</Button>
            <Button variant="inverted" onClick={() => void abandon()} disabled={busy} data-testid="abandon-confirm">{t.home.abandonConfirmBtn}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CourseSwitcher({ certs, current }: { certs: DashboardData["certs"]; current: string }) {
  const { t } = useLocale();
  if (certs.length < 2) return null;
  const name = certs.find((c) => c.slug === current)?.shortCode ?? current;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t.home.courseSwitch} data-testid="course-switcher" className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-meta font-medium hover:bg-surface-2">
        <span className="text-subtle">{t.home.courseLabel}:</span>
        <span className="max-w-[12rem] truncate">{name}</span>
        <ChevronDown className="h-4 w-4 text-faint" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t.home.courseSwitch}</DropdownMenuLabel>
        {certs.map((c) => (
          <DropdownMenuItem key={c.id} asChild>
            <Link href={`/?kurs=${encodeURIComponent(c.slug)}`} className="justify-between">
              <span className="truncate">{c.name}</span>
              {c.slug === current && <Check className="h-4 w-4 shrink-0 text-link" aria-hidden="true" />}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MonthCalendar({ data }: { data: DashboardData }) {
  const { t, locale } = useLocale();
  const h = t.home;
  const now = new Date(data.nowIso);
  const grid = monthGrid(now);
  const todayKey = data.nowIso.slice(0, 10);
  const active = new Set(data.activeDays);
  const months = h.months.split(",");
  const monthsShort = h.monthsShort.split(",");
  const upcoming = data.events
    .filter((e) => e.dateIso.slice(0, 10) >= todayKey)
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso))
    .slice(0, 3);
  const learnedInMonth = grid.cells.filter((c) => c.inMonth && active.has(c.key)).length;
  return (
    <Card className="flex flex-col gap-3" data-testid="calendar-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-body font-semibold">{h.calendar}</h2>
        <span className="text-meta text-muted">{months[grid.month]} {grid.year}</span>
      </div>
      <p className="text-xs text-subtle">{h.calendarLegend}</p>
      <table className="w-full table-fixed border-separate border-spacing-1 text-center text-meta tabular-nums" aria-label={`${h.calendar} ${months[grid.month]} ${grid.year}`}>
        <thead>
          <tr>{h.days.split(",").map((d) => <th key={d} scope="col" className="text-2xs font-semibold text-faint">{d}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: grid.cells.length / 7 }, (_, w) => (
            <tr key={w}>
              {grid.cells.slice(w * 7, w * 7 + 7).map((c) => {
                const learned = active.has(c.key);
                const isToday = c.key === todayKey;
                return (
                  <td key={c.key} className="p-0">
                    <span
                      className={cn(
                        "relative mx-auto flex h-8 w-8 items-center justify-center rounded-lg",
                        !c.inMonth && "text-faint opacity-50",
                        c.inMonth && "text-text-2",
                        isToday && "bg-accent font-semibold text-on-accent",
                      )}
                      aria-current={isToday ? "date" : undefined}
                    >
                      {c.day}
                      {learned && <span className={cn("absolute bottom-1 h-1 w-1 rounded-full", isToday ? "bg-on-accent" : "bg-accent")} aria-hidden="true" />}
                      {(learned || isToday) && <span className="sr-only">{[isToday ? h.today : null, learned ? h.calendarLearned : null].filter(Boolean).join(", ")}</span>}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-faint">{fmt(h.weekGoalOf, { x: data.week.activeDays, y: data.week.plannedDays })} · {learnedInMonth} {h.calendarLearned} ({months[grid.month]})</p>
      <div className="flex flex-col gap-2.5 border-t border-border-subtle pt-3">
        <Overline>{h.upcoming}</Overline>
        {upcoming.length === 0 ? (
          <p className="text-meta text-subtle">{h.upcomingNone}</p>
        ) : (
          upcoming.map((e) => {
            const d = new Date(e.dateIso);
            const days = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY);
            return (
              <Link key={`${e.kind}-${e.name}-${e.dateIso}`} href={e.href} className="group flex items-center gap-3 rounded-lg">
                <span className={cn("flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[10px] text-2xs leading-tight font-semibold", e.kind === "exam" ? "bg-accent-soft text-link" : "bg-warning-soft text-warning-text")}>
                  <span>{monthsShort[d.getUTCMonth()]}</span>
                  <span className="text-meta">{d.getUTCDate()}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-meta font-semibold group-hover:underline">{fmt(e.kind === "exam" ? h.examEvent : h.deadlineEvent, { name: e.name })}</span>
                  <span className="block text-xs text-subtle">{days === 0 ? h.today : days === 1 ? h.inOneDay : fmt(h.inDays, { n: days })} · {d.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" })}</span>
                </span>
              </Link>
            );
          })
        )}
      </div>
    </Card>
  );
}

type OpenEntry = { key: string; href: string | null; icon: LucideIcon; tone: string; title: string; sub: string | null; testId?: string };

/** „Offen für dich“: auf dem Handy direkt unter dem nächsten Schritt, ab xl in der rechten Spalte. */
function OpenCard({ items, className, withTestIds = false }: { items: OpenEntry[]; className?: string; withTestIds?: boolean }) {
  const { t } = useLocale();
  const h = t.home;
  return (
    <Card className={cn("flex-col gap-2.5", className)} data-testid={withTestIds ? "open-card" : undefined}>
      <h2 className="text-body font-semibold">{h.openForYou}</h2>
      {items.length === 0 ? (
        <p className="text-meta text-subtle">{h.openNone}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((o) => (
            <li key={o.key}>
              {o.href ? (
                <Link href={o.href} data-testid={withTestIds ? o.testId : undefined} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 hover:border-border-strong">
                  <IconTile icon={o.icon} className={o.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-meta font-medium">{o.title}</span>
                    {o.sub && <span className="block truncate text-xs text-subtle">{o.sub}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                </Link>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
                  <IconTile icon={o.icon} className={o.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-meta font-medium">{o.title}</span>
                    {o.sub && <span className="block text-xs text-subtle">{o.sub}</span>}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Dashboard({ data }: { data: DashboardData }) {
  const { locale, t } = useLocale();
  const h = t.home;
  const part = useGreetingPart();
  const greeting = fmt(part === "morning" ? h.greetMorning : part === "evening" ? h.greetEvening : part === "day" ? h.greetDay : h.greetHello, { name: data.name });
  const dueMinutes = Math.max(1, Math.round(data.dueTotal * MINUTES_PER_CARD));
  // Nach längerer Pause keine Rückstand-Zahl: „Willkommen zurück – heute nur 5 Minuten“, der Rest wird über die nächsten Tage verteilt.
  const welcomeBack = Boolean(data.welcomeBack) && data.dueTotal > 0;
  const dueLine = welcomeBack ? h.welcomeBackLine : data.dueTotal > 0 ? fmt(h.dueLine, { n: data.dueTotal, m: dueMinutes }) : h.noDueLine;
  const examLine = data.main && data.main.examInDays !== null && data.main.examInDays >= 0 ? ` ${fmt(h.examLine, { name: data.main.certName, n: data.main.examInDays })}` : "";
  const stateText = (c: DashboardData["certs"][number]) => ({ planned: fmt(h.pillPlanned, { n: c.examInDays ?? 0 }), started: h.pillStarted, not_started: h.pillNotStarted, completed: h.pillCompleted })[c.state];
  const stateTone = (s: CertState) => (s === "completed" ? "success" : s === "planned" ? "accent" : s === "started" ? "info" : "neutral");
  const btnText = (s: CertState) => (s === "not_started" ? h.btnStart : s === "completed" ? h.btnRepeat : h.btnContinue);
  const [masteryView, setMasteryView] = useState<"weakest" | "all">("weakest");
  const domains = data.main ? (masteryView === "weakest" ? data.main.domains.slice(0, 4) : data.main.domains) : [];
  const dayNames = h.days.split(",");
  const maxBar = Math.max(1, ...data.week.counts);
  const weekAnswers = data.week.counts.reduce((a, b) => a + b, 0);
  const weekDays = data.week.counts.filter((n) => n > 0).length;
  const level = data.main ? LEVEL[data.main.readiness.level] : null;

  const openItems: OpenEntry[] = [];
  if (data.main && data.main.dueCount > 0) {
    openItems.push({ key: "due", href: `/cert/${data.main.certSlug}/session`, icon: Clock, tone: "bg-warning-soft text-warning-text", title: welcomeBack ? h.reviewsSoft : fmt(h.openDue, { n: data.main.dueCount }), sub: fmt(h.openDueSub, { name: data.main.certName, m: Math.max(1, Math.round(data.main.dueCount * MINUTES_PER_CARD)) }) });
  }
  if (data.main?.recommendation) {
    openItems.push({ key: "gap", href: `/cert/${data.main.certSlug}/remediation/${data.main.recommendation.objectiveId}`, icon: Target, tone: "bg-danger-soft text-danger-text", title: fmt(h.openGap, { title: data.main.recommendation.objectiveTitle }), sub: data.main.recommendation.domainName, testId: "close-gap" });
  }
  for (const item of data.open) {
    if (item.kind === "assignment") openItems.push({ key: `a-${item.slug}`, href: `/cert/${item.slug}`, icon: BookOpen, tone: "bg-info-soft text-info-text", title: fmt(h.openAssignment, { name: item.name }), sub: item.dueIso ? `${h.due} ${new Date(item.dueIso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" })}` : h.assignedNote, testId: "open-assignment" });
    else if (item.kind === "practice") openItems.push({ key: "practice", href: "#practice-tasks", icon: CircleHelp, tone: "bg-info-soft text-info-text", title: fmt(h.openPractice, { n: item.count }), sub: h.openPracticeSub });
    else openItems.push({ key: `m-${item.topic}`, href: null, icon: MessageSquare, tone: item.answered ? "bg-success-soft text-success-text" : "bg-surface-2 text-muted", title: fmt(item.answered ? h.openMentor : h.openMentorWaiting, { topic: item.topic }), sub: item.answered ? item.note : h.openMentorWaitingSub });
  }

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard">
      <InstallBanner />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-title sm:text-title" data-testid="greeting">{greeting}</h1>
          <p className="mt-1.5 text-body text-subtle">{dueLine}{examLine}</p>
        </div>
        {data.main && <CourseSwitcher certs={data.certs} current={data.main.certSlug} />}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Card variant="hero" className="flex flex-col gap-3 p-5 sm:p-6" data-testid="hero">
              <div className="flex items-center gap-2.5">
                <IconTile icon={Play} className="bg-accent-soft text-link" />
                <Overline className="text-link">{h.nextUp}{data.hero && ago(data.hero.lastAtIso, data.nowIso, t) ? ` · ${fmt(h.lastAgo, { when: ago(data.hero.lastAtIso, data.nowIso, t) ?? "" })}` : ""}</Overline>
              </div>
              {data.hero ? (
                <>
                  <h2 className="text-xl leading-snug font-semibold tracking-tight">{data.hero.sectionTitle[locale]}</h2>
                  <p className="text-meta text-muted">{data.hero.certName} · {data.hero.domainName} · {fmt(h.sectionXofY, { x: data.hero.position, y: data.hero.total })}</p>
                  <ProgressBar value={data.hero.percent} tone="accent" label={`${h.resume}: ${data.hero.percent} %`} />
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
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
                  <h2 className="text-xl font-semibold tracking-tight">{h.startFirst}</h2>
                  <p className="max-w-md text-sm text-muted">{h.startFirstBody}</p>
                  <Button asChild className="mt-auto self-start"><Link href="/catalog" data-testid="hero-catalog">{h.browseCatalog}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
                </>
              )}
            </Card>

            <Card className="flex flex-col gap-4" data-testid="readiness-card">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-2xs font-semibold tracking-overline text-faint uppercase">{h.readiness}</h2>
                {level && <Badge tone={level.tone}>{h[level.key]}</Badge>}
              </div>
              {data.main ? (
                <>
                  <div className="flex items-center gap-4">
                    {data.main.readiness.score !== null ? (
                      <ProgressRing value={data.main.readiness.score} unit="%" label={`${h.readiness}: ${data.main.readiness.score} %`} className="h-[112px] w-[112px]" />
                    ) : (
                      <p className="flex h-[112px] w-[112px] shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border-strong p-3 text-center text-xs text-subtle">{h.readinessUnknown}</p>
                    )}
                    <dl className="grid min-w-0 flex-1 gap-2">
                      <div className="rounded-lg bg-surface-2 px-3 py-2">
                        <dt className="text-2xs font-semibold tracking-overline text-faint uppercase">{h.readinessCoverage}</dt>
                        <dd className="text-lead font-semibold tabular-nums">{data.main.readiness.coverage} %</dd>
                      </div>
                      <div className="rounded-lg bg-surface-2 px-3 py-2">
                        <dt className="text-2xs font-semibold tracking-overline text-faint uppercase">{h.readinessAccuracy}</dt>
                        <dd className="text-lead font-semibold tabular-nums">{data.stats.accuracyWeek === null ? "–" : `${data.stats.accuracyWeek} %`}</dd>
                      </div>
                    </dl>
                  </div>
                  <p className="text-xs text-subtle">{h.readinessNote}</p>
                  <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-border-subtle pt-3 text-meta">
                    {data.main.examInDays !== null && data.main.examInDays >= 0 ? (
                      <>
                        <span className="text-muted">{fmt(h.examIn, { n: data.main.examInDays })}</span>
                        <Link href={`/cert/${data.main.certSlug}/final-exam`} className="font-medium text-link hover:underline">{h.simulate}</Link>
                      </>
                    ) : (
                      <Link href={`/cert/${data.main.certSlug}`} className="font-medium text-link hover:underline">{h.planExam}</Link>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-subtle">{h.readinessUnknown}</p>
              )}
            </Card>
          </div>

          <OpenCard items={openItems} className="flex xl:hidden" withTestIds />

          <section aria-labelledby="glance" className="flex flex-col gap-3" data-testid="stat-tiles">
            <div>
              <h2 id="glance" className="text-body font-semibold">{h.glance}</h2>
              <p className="text-xs text-faint">{h.glanceSub}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { icon: CircleHelp, tone: "bg-info-soft text-info-text", value: data.stats.answeredTotal.toLocaleString(locale === "de" ? "de-DE" : "en-GB"), label: h.statAnswered, sub: fmt(h.statAnsweredSub, { n: data.stats.answeredWeek }), subTone: "text-subtle" },
                {
                  icon: Check,
                  tone: "bg-success-soft text-success-text",
                  value: data.stats.accuracyWeek === null ? "–" : `${data.stats.accuracyWeek} %`,
                  label: h.statAccuracy,
                  sub: data.stats.accuracyWeek === null ? h.statAccuracyNone : data.stats.accuracyDelta === null ? null : fmt(h.statAccuracySub, { n: `${data.stats.accuracyDelta > 0 ? "+" : ""}${data.stats.accuracyDelta}` }),
                  subTone: data.stats.accuracyDelta !== null && data.stats.accuracyDelta < 0 ? "text-warning-text" : "text-subtle",
                },
                { icon: BookOpen, tone: "bg-accent-soft text-link", value: data.stats.lessonsDone, label: h.statLessons, sub: fmt(h.statLessonsSub, { n: data.stats.lessonsDoneWeek }), subTone: "text-subtle" },
                { icon: Clock, tone: "bg-warning-soft text-warning-text", value: data.learningMinutesWeek === null ? "–" : minutesText(data.learningMinutesWeek, t), label: h.statLearningTime, sub: data.learningMinutesWeek === null ? h.statLearningTimeNone : h.statLearningTimeSub, subTone: "text-subtle" },
              ].map((s) => (
                <div key={s.label} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4">
                  <IconTile icon={s.icon} className={s.tone} />
                  <div className="min-w-0">
                    <p className="truncate text-2xl leading-tight font-semibold tabular-nums">{s.value}</p>
                    <p className="text-meta font-medium">{s.label}</p>
                    {s.sub && <p className={cn("mt-0.5 text-xs", s.subTone)}>{s.sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-4" data-testid="mastery-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-body font-semibold">{h.mastery}</h2>
                {data.main && data.main.domains.length > 4 && (
                  <SegmentedControl value={masteryView} onChange={setMasteryView} label={h.mastery} options={[{ value: "weakest", label: h.masteryWeakest }, { value: "all", label: h.masteryAll }]} />
                )}
              </div>
              {domains.length === 0 ? (
                <p className="text-sm text-subtle">{h.masteryEmpty}</p>
              ) : (
                <ul className="flex flex-col gap-3.5">
                  {domains.map((d) => {
                    const l = LIGHT[d.light];
                    const Icon = l.icon;
                    return (
                      <li key={d.name}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-meta">
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon className={cn("h-3.5 w-3.5 shrink-0", l.text)} aria-hidden="true" />
                            <span className="truncate">{d.name}</span>
                          </span>
                          <span className={cn("shrink-0 font-semibold tabular-nums", l.text)}>
                            {d.percent} %<span className="sr-only"> ({{ strong: h.lightStrong, practice: h.lightPractice, weak: h.lightWeak }[d.light]})</span>
                          </span>
                        </div>
                        <ProgressBar value={d.percent} tone={l.bar} label={fmt(h.masteryPercentLabel, { name: d.name, n: d.percent })} />
                      </li>
                    );
                  })}
                </ul>
              )}
              {data.main?.recommendation && (
                <Link href={`/cert/${data.main.certSlug}/remediation/${data.main.recommendation.objectiveId}`} className="mt-auto inline-flex items-center gap-1 text-meta font-medium text-link hover:underline">
                  {h.closeGap}: {data.main.recommendation.objectiveTitle}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </Link>
              )}
            </Card>

            <Card className="flex flex-col gap-3" data-testid="week-card">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-body font-semibold">{h.perDay}</h2>
                <span className="flex items-center gap-2 text-xs text-faint">
                  {data.streak > 0 && <Badge tone="warning"><Flame className="h-3.5 w-3.5" aria-hidden="true" />{fmt(h.streakNote, { n: data.streak })}</Badge>}
                  {h.perDaySub}
                </span>
              </div>
              <div className="flex h-36 items-end gap-2" role="img" aria-label={data.week.counts.map((n, i) => `${dayNames[i]} ${n}`).join(", ")}>
                {data.week.counts.map((n, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-2xs text-faint tabular-nums">{n > 0 ? n : ""}</span>
                    <div className={cn("w-full max-w-7 rounded-t-md", n === 0 ? "h-0.5 bg-track" : i === data.week.todayIndex ? "bg-accent" : "bg-chart-data")} style={n === 0 ? undefined : { height: `${Math.max(6, Math.round((n / maxBar) * 75))}%` }} />
                    <span className={cn("text-2xs", i === data.week.todayIndex ? "font-semibold text-foreground" : "text-faint")}>{dayNames[i]}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-subtle">{weekAnswers > 0 ? fmt(h.perDaySummary, { n: weekAnswers, d: weekDays }) : h.perDayEmpty}</p>
              <div className="mt-auto border-t border-border-subtle pt-3">
                <div className="mb-1 flex justify-between text-xs text-subtle">
                  <span>{h.weekGoal}</span>
                  <span className="tabular-nums">{fmt(h.weekGoalOf, { x: data.week.activeDays, y: data.week.plannedDays })}</span>
                </div>
                <ProgressBar value={(data.week.activeDays / data.week.plannedDays) * 100} tone="accent" label={h.weekGoal} />
              </div>
            </Card>
          </div>

          {data.main?.progress && <ProgressReviewCard review={data.main.progress.review} outlook={data.main.progress.outlook} series={data.main.progress.series} locale={locale} certSlug={data.main.certSlug} />}

          <section aria-labelledby="my-courses" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 id="my-courses" className="text-body font-semibold">{h.myCerts}</h2>
              <Link href="/catalog" className="text-meta font-medium text-link hover:underline">{h.browseCatalog}</Link>
            </div>
            {data.certs.length === 0 ? (
              <EmptyState icon={<BookOpen />} title={h.startFirst} description={h.startFirstBody} action={<Button asChild size="sm"><Link href="/catalog">{h.browseCatalog}</Link></Button>} />
            ) : (
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
                {data.certs.map((c) => (
                  <li key={c.id}>
                    <Card className={cn("flex h-full flex-col gap-3 p-4", data.main?.certSlug === c.slug && "border-accent-border")} data-testid={`cert-card-${c.slug}`}>
                      <div className="flex items-center gap-3">
                        <ProgressRing value={c.percent} unit="%" size="sm" tone={c.state === "completed" ? "success" : "accent"} label={`${c.name}: ${fmt(h.lessonsXofY, { x: c.doneLessons, y: c.totalLessons })}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{c.name}</p>
                          <p className="flex items-center gap-1.5 text-xs text-subtle">
                            <span className={cn("rounded px-1.5 font-mono text-2xs font-semibold", TILE_COLOR[c.color])}>{c.shortCode}</span>
                            <span className="truncate">{fmt(h.lessonsXofY, { x: c.doneLessons, y: c.totalLessons })}</span>
                          </p>
                        </div>
                      </div>
                      {c.seal && <CourseSeal seal={c.seal} locale={locale} variant="compact" />}
                      <div className="mt-auto flex items-center justify-between gap-2">
                        <Badge tone={stateTone(c.state)}>{stateText(c)}</Badge>
                        <Button asChild size="sm" variant={c.state === "not_started" ? "primary" : "secondary"}><Link href={`/cert/${c.slug}`}>{btnText(c.state)}</Link></Button>
                      </div>
                      {!c.assigned && <div className="-mb-1"><AbandonCourseButton certId={c.id} name={c.name} /></div>}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <MonthCalendar data={data} />

          <OpenCard items={openItems} className="hidden xl:flex" />

          <Card className="flex flex-col gap-1" data-testid="recent-card">
            <h2 className="mb-2 text-body font-semibold">{h.recent}</h2>
            {data.recent.length === 0 ? (
              <p className="text-meta text-subtle">{h.recentNone}</p>
            ) : (
              <ul>
                {data.recent.map((r, i) => (
                  <li key={`${r.kind}-${r.atIso}-${i}`} className="flex gap-3 border-b border-border-subtle py-2.5 last:border-0">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", r.kind === "lesson" ? "bg-accent" : r.passed ? "bg-success" : "bg-info")} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-meta">{r.kind === "lesson" ? r.title[locale] : `${h.recentExam}: ${r.score === null ? "–" : fmt(h.recentExamScore, { n: r.score })}${r.passed === null ? "" : ` · ${r.passed ? h.recentPassed : h.recentFailed}`}`}</span>
                      <span className="block truncate text-xs text-faint">{r.certName} · {ago(r.atIso, data.nowIso, t)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
