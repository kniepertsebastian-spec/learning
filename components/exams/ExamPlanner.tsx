"use client";

import { ArrowRight, CalendarPlus, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Overline } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { READY_STREAK, READY_THRESHOLD } from "@/lib/exams/plan";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { PlannerOverview, PlannerCert } from "@/lib/server/exams/planner";
import type { CourseCategoryColor } from "@/lib/server/db/schema";

const TILE: Record<CourseCategoryColor, string> = { info: "bg-info-soft text-info-text", mint: "bg-mint-soft text-mint-text", warning: "bg-warning-soft text-warning-text", danger: "bg-danger-soft text-danger-text", violet: "bg-surface-2 text-violet" };
const PROVIDER_NAME = { pearson_vue: "Pearson VUE", psi: "PSI", linux_foundation: "Linux Foundation", other: "" } as const;
const field = "w-full rounded-md border border-border-strong bg-control px-3 py-2 text-sm";

function formatDateTime(iso: string, locale: "de" | "en") {
  const d = new Date(iso);
  return { date: d.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { day: "2-digit", month: "long", year: "numeric" }), time: d.toLocaleTimeString(locale === "de" ? "de-DE" : "en-GB", { hour: "2-digit", minute: "2-digit" }) };
}

export function ExamPlanner({ data }: { data: PlannerOverview }) {
  const { locale, t } = useLocale();
  const p = t.planner;
  const router = useRouter();
  const [editFor, setEditFor] = useState<{ cert: PlannerCert | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const next = data.next;

  async function patch(id: string, status: "passed" | "failed" | "cancelled") {
    setBusy(true);
    try {
      await fetch(`/api/exam-plans/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function share(id: string, shared: boolean) {
    await fetch(`/api/exam-plans/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shareWithCompany: shared }) });
    router.refresh();
  }

  const modeText = (m: string | null) => (m === "online" ? p.modeOnline : m === "test_center" ? p.modeCenter : null);
  const weeklyHours = next?.cert.plan?.weeklyGoalHours ?? 5;

  return (
    <div className="flex flex-col gap-6" data-testid="exam-planner">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
          <p className="mt-1 text-sm text-subtle">{p.subtitle}</p>
        </div>
        <Button onClick={() => setEditFor({ cert: null })} iconLeft={<CalendarPlus className="h-4 w-4" aria-hidden="true" />} data-testid="add-exam-date">{p.addDate}</Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card variant="hero" className="lg:col-span-2" data-testid="next-exam">
          {next ? (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-[132px] w-[132px] shrink-0 flex-col items-center justify-center rounded-2xl border border-mint-border bg-surface" data-testid="countdown">
                <span className="text-[52px] leading-none font-bold tabular-nums">{next.daysLeft}</span>
                <span className="mt-1 text-sm text-subtle">{next.daysLeft === 1 ? p.day : p.days}</span>
              </div>
              <div className="min-w-0">
                <Overline className="text-mint-text">{p.nextExam}</Overline>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{next.cert.name}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(() => {
                    const dt = formatDateTime(next.cert.plan!.scheduledAt!, locale);
                    return (
                      <>
                        <Badge tone="neutral">{dt.date} · {dt.time}</Badge>
                        {modeText(next.cert.plan!.deliveryMode) && <Badge tone="info">{modeText(next.cert.plan!.deliveryMode)}</Badge>}
                        {next.cert.examProvider && PROVIDER_NAME[next.cert.examProvider] && <Badge tone="neutral">{fmt(p.bookVia, { name: PROVIDER_NAME[next.cert.examProvider] })}</Badge>}
                      </>
                    );
                  })()}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {next.cert.bookingUrl && (
                    <Button asChild size="sm"><a href={next.cert.bookingUrl} target="_blank" rel="noopener noreferrer">{p.bookingPage}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a></Button>
                  )}
                  <Button asChild size="sm" variant="secondary"><a href={`/api/exam-plans/${next.cert.plan!.id}/ics`} data-testid="ics-link">{p.toCalendar}</a></Button>
                  <Button asChild size="sm" variant="secondary"><a href={`/api/exam-plans/${next.cert.plan!.id}/ics?study=1`}>{p.toCalendarStudy}</a></Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditFor({ cert: next.cert })}>{p.editDate}</Button>
                </div>
                {data.companyName && (
                  <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={next.cert.plan!.shareWithCompany} onChange={(e) => void share(next.cert.plan!.id, e.target.checked)} data-testid="share-plan" />
                    {fmt(p.shareFor, { name: data.companyName })}
                  </label>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void patch(next.cert.plan!.id, "passed")}>{p.markPassed}</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void patch(next.cert.plan!.id, "failed")}>{p.markFailed}</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void patch(next.cert.plan!.id, "cancelled")}>{p.cancelPlan}</Button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Overline className="text-mint-text">{p.nextExam}</Overline>
              <h2 className="mt-2 text-xl font-semibold">{p.noNext}</h2>
              <p className="mt-1 max-w-md text-sm text-muted">{p.noNextBody}</p>
            </div>
          )}
        </Card>

        <Card data-testid="ready-card">
          <h2 className="text-base font-semibold">{p.ready}</h2>
          <p className="mt-1 text-xs text-subtle">{fmt(p.readyRule, { n: READY_THRESHOLD })}</p>
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {data.readiness.scores.map((s, i) => (
              <li key={i} className={cn("flex h-16 flex-col items-center justify-center rounded-xl border", s !== null && s >= READY_THRESHOLD ? "border-mint bg-mint-soft" : "border-border bg-surface-inset")}>
                <span className="text-xl font-semibold tabular-nums">{s === null ? "–" : Math.round(s)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-xl border border-warning/40 bg-warning-soft p-3 text-xs text-warning-text">{fmt(p.readyReached, { x: data.readiness.reached, y: READY_STREAK, m: data.readiness.ready ? p.readyDone : p.readyKeep })}</p>
          {next && <Link href={`/cert/${next.cert.slug}/final-exam`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-link hover:underline">{p.startSim}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
        </Card>
      </div>

      <section aria-label={p.plan} data-testid="study-plan">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{p.plan}</h2>
          {next && <span className="text-sm text-subtle">{p.weeklyGoal}: {weeklyHours} {p.hoursShort}</span>}
        </div>
        {data.weeks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-sm text-subtle">{p.noPlan}</p>
        ) : (
          <>
            {data.overflowMinutes > 0 && <p className="mb-3 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-text">{fmt(p.overflow, { n: data.overflowMinutes })}</p>}
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]">
              {data.weeks.map((w) => {
                const state = w.past ? p.stDone : w.current ? p.stNow : p.stPlanned;
                return (
                  <li key={w.start}>
                    <Card className={cn("flex h-full flex-col gap-2", w.current && "border-mint")} data-testid={`week-${w.kw}`} data-current={w.current || undefined}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-subtle">{fmt(p.week, { n: w.kw })}</span>
                        <Badge tone={w.past ? "mint" : w.current ? "info" : "neutral"}>{state}</Badge>
                      </div>
                      <p className="font-semibold">{w.kind === "simulate" ? p.kindSimulate : w.kind === "review" ? p.kindReview : p.kindLearn}</p>
                      <p className="text-xs text-subtle">
                        {w.kind === "simulate" ? p.kindSimulateDesc : w.kind === "review" ? p.kindReviewDesc : w.topics.slice(0, 3).join(" · ") || "–"}
                      </p>
                      {w.kind === "learn" && w.lessonIds.length > 0 && (
                        <div className="mt-auto">
                          <div className="mb-1 flex justify-between text-xs text-subtle tabular-nums"><span>{fmt(p.lessonsXofY, { x: w.doneLessons, y: w.lessonIds.length })}</span><span>{(w.plannedMinutes / 60).toFixed(1)} {p.hoursShort}</span></div>
                          <ProgressBar value={(w.doneLessons / w.lessonIds.length) * 100} tone="accent" label={fmt(p.week, { n: w.kw })} />
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-label={p.others}>
          <h2 className="mb-3 text-lg font-semibold">{p.others}</h2>
          <ul className="flex flex-col gap-2">
            {data.certs.map((c) => {
              const planned = c.plan?.scheduledAt;
              const pill = planned ? <Badge tone="mint">{p.stPlannedPill}</Badge> : c.hasVoucher || c.plan?.voucherExpiresAt ? <Badge tone="info">{p.stVoucher}</Badge> : <Badge tone="neutral">{p.stNotPlanned}</Badge>;
              const link = c.testCenterUrl ?? c.bookingUrl;
              return (
                <li key={c.id}>
                  <Card className="flex flex-wrap items-center gap-3 p-4" data-testid={`planner-cert-${c.slug}`}>
                    <span className={cn("flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl font-mono text-meta font-semibold", TILE[c.color])} aria-hidden="true">{c.shortCode}</span>
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="text-xs text-subtle">{c.provider}{c.deliveryModes.length ? ` · ${c.deliveryModes.map((m) => modeText(m)).join(" / ")}` : ""}</p>
                    </div>
                    {pill}
                    <Button size="sm" variant="secondary" onClick={() => setEditFor({ cert: c })}>{planned ? p.editDate : p.addDate}</Button>
                    {link && <Button asChild size="sm" variant="ghost"><a href={link} target="_blank" rel="noopener noreferrer">{c.testCenterUrl ? p.findCenter : p.bookDate}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a></Button>}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        <aside>
          <h2 className="mb-3 text-lg font-semibold">{p.reminders}</h2>
          <Card className="p-4">
            {data.reminders.length === 0 ? (
              <p className="text-sm text-subtle">{p.noReminders}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {data.reminders.map((r, i) => (
                  <li key={i}>{r.kind === "voucher" ? fmt(p.remVoucher, { name: r.certName, n: r.detail ?? "" }) : r.kind === "retake" ? fmt(p.remRetake, { name: r.certName }) : fmt(p.remSuccessor, { name: r.certName, text: r.detail ?? "" })}</li>
                ))}
              </ul>
            )}
          </Card>
          <p className="mt-3 text-xs text-faint">{p.footnote}</p>
        </aside>
      </div>

      {editFor && <PlanDialog key={editFor.cert?.id ?? "new"} certs={data.certs} initial={editFor.cert} onClose={() => setEditFor(null)} />}
    </div>
  );
}

function PlanDialog({ certs, initial, onClose }: { certs: PlannerCert[]; initial: PlannerCert | null; onClose: () => void }) {
  const { t } = useLocale();
  const p = t.planner;
  const router = useRouter();
  const existing = initial?.plan ?? null;
  const [certId, setCertId] = useState(initial?.id ?? "");
  const [date, setDate] = useState(existing?.scheduledAt ? new Date(existing.scheduledAt).toISOString().slice(0, 10) : "");
  const [time, setTime] = useState(existing?.scheduledAt ? new Date(existing.scheduledAt).toISOString().slice(11, 16) : "09:00");
  const [mode, setMode] = useState<string>(existing?.deliveryMode ?? "");
  const [voucher, setVoucher] = useState(existing?.voucherExpiresAt ? existing.voucherExpiresAt.slice(0, 10) : "");
  const [retake, setRetake] = useState(existing?.retakeIncluded ?? false);
  const [hours, setHours] = useState(existing?.weeklyGoalHours ?? 5);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!certId) return setError(p.needCourse);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/exam-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certificationId: certId,
          scheduledAt: date ? new Date(`${date}T${time || "09:00"}:00Z`).toISOString() : null,
          deliveryMode: mode || null,
          voucherExpiresAt: voucher ? new Date(`${voucher}T23:59:00Z`).toISOString() : null,
          retakeIncluded: retake,
          weeklyGoalHours: hours,
        }),
      });
      if (!res.ok) return setError(p.saveFailed);
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent closeLabel={p.close} data-testid="plan-dialog">
        <DialogTitle>{existing ? p.editDate : p.addDate}</DialogTitle>
        <DialogDescription className="sr-only">{p.subtitle}</DialogDescription>
        <div className="mt-4 space-y-3">
          <label className="block text-sm"><span className="mb-1 block font-medium">{p.fCourse}</span>
            <select value={certId} onChange={(e) => setCertId(e.target.value)} disabled={Boolean(initial)} className={field} data-testid="plan-course">
              <option value="">–</option>
              {certs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm"><span className="mb-1 block font-medium">{p.fDate}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} data-testid="plan-date" /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">{p.fTime} (UTC)</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} /></label>
          </div>
          <label className="block text-sm"><span className="mb-1 block font-medium">{p.fMode}</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={field}>
              <option value="">{p.fOptionalMode}</option>
              <option value="online">{p.modeOnline}</option>
              <option value="test_center">{p.modeCenter}</option>
            </select>
          </label>
          <label className="block text-sm"><span className="mb-1 block font-medium">{p.fVoucher}</span><input type="date" value={voucher} onChange={(e) => setVoucher(e.target.value)} className={field} /></label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={retake} onChange={(e) => setRetake(e.target.checked)} />{p.fRetake}</label>
          <label className="block text-sm"><span className="mb-1 block font-medium">{p.fHours}</span><input type="number" min={1} max={40} value={hours} onChange={(e) => setHours(Number(e.target.value))} className={field} /></label>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-danger-text">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{p.cancel}</Button>
          <Button onClick={() => void save()} disabled={busy} data-testid="plan-save">{p.save}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
