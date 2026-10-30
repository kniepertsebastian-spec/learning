"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { jobStepFill, jobStepIndex } from "@/lib/admin/job-steps";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";

interface ListedJob {
  id: string;
  status: string;
  courseTitle?: string;
  actualCostUsd: string;
  initialCostLimitUsd: string;
  absoluteCostLimitUsd: string;
  message?: string | null;
  /** Letztes Lebenszeichen (Auftrag oder Lernziel) und ob der Lauf ohne Lebenszeichen hängt, siehe GET /api/admin/course-generation. */
  lastActivityAt?: string;
  stale?: boolean;
  /** In diesem Serverprozess arbeitet ein Worker daran (sonst wird ein hängender Auftrag automatisch fortgesetzt). */
  active?: boolean;
}

const DONE = new Set(["published", "package_ready", "cancelled", "failed", "preflight_failed", "canary_failed"]);

/** Leiste über dem Katalog: laufende Generierungen mit Schritt, 5-teiligem Balken und Kosten (Werte aus dem bestehenden Auftrag). */
export function JobBar() {
  const [confirm, confirmDialog] = useConfirm();
  const { t } = useLocale();
  const [jobs, setJobs] = useState<Array<ListedJob & { fraction: number; idleMinutes: number }>>([]);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  const cancelJob = useCallback(
    async (job: ListedJob) => {
      if (!(await confirm(fmt(t.admin_catalog.jobCancelConfirm, { name: job.courseTitle ?? "" })))) return;
      setCancelling((prev) => new Set(prev).add(job.id));
      try {
        const res = await fetch(`/api/admin/course-generation/${job.id}/cancel`, { method: "POST" });
        // Abgebrochen (oder inzwischen ohnehin beendet): sofort aus der Leiste nehmen, der nächste Abruf bestätigt es.
        if (res.ok || res.status === 409) setJobs((prev) => prev.filter((j) => j.id !== job.id));
      } finally {
        setCancelling((prev) => {
          const next = new Set(prev);
          next.delete(job.id);
          return next;
        });
      }
    },
    [t, confirm],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/course-generation", { cache: "no-store" });
        if (!res.ok) return;
        const { jobs: listed } = (await res.json()) as { jobs: ListedJob[] };
        const running = listed.filter((j) => !DONE.has(j.status));
        const withProgress = await Promise.all(
          running.map(async (j) => {
            let fraction = 0.5;
            if (jobStepIndex(j.status) === 3) {
              try {
                const d = await fetch(`/api/admin/course-generation/${j.id}`, { cache: "no-store" });
                if (d.ok) {
                  const { objectives } = (await d.json()) as { objectives: Array<{ status: string }> };
                  const done = objectives.filter((o) => o.status === "valid" || o.status === "failed").length;
                  if (objectives.length) fraction = done / objectives.length;
                }
              } catch {
                // Fortschritt bleibt geschätzt
              }
            }
            // Minuten ohne Lebenszeichen hier beim Abruf berechnen, nicht beim Rendern (Render bleibt rein).
            const idleMinutes = j.lastActivityAt ? Math.max(1, Math.round((Date.now() - new Date(j.lastActivityAt).getTime()) / 60_000)) : 0;
            return { ...j, fraction, idleMinutes };
          }),
        );
        if (!cancelled) setJobs(withProgress);
      } catch {
        // nächster Tick
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (jobs.length === 0) return null;
  const names = [t.admin_catalog.step1, t.admin_catalog.step2, t.admin_catalog.step3, t.admin_catalog.step4, t.admin_catalog.step5];
  return (
    <>
    {confirmDialog}
    <div className="mb-5 flex flex-col gap-2" data-testid="job-bar" aria-live="polite">
      {jobs.map((j) => {
        const step = jobStepIndex(j.status);
        const fill = jobStepFill(j.status, j.fraction);
        return (
          <div key={j.id} className="rounded-2xl border border-info/40 bg-info-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
              <p className="flex items-center gap-2 font-semibold text-info-text">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {fmt(t.admin_catalog.jobRunning, { name: j.courseTitle ?? "" })}
              </p>
              <p className="text-xs text-muted tabular-nums">
                {fmt(t.admin_catalog.jobCost, { a: Number(j.actualCostUsd).toFixed(2), b: Number(j.initialCostLimitUsd).toFixed(2) })} · {fmt(t.admin_catalog.jobLimit, { n: Number(j.absoluteCostLimitUsd).toFixed(2) })}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-subtle">{fmt(t.admin_catalog.jobStep, { x: step + 1, name: names[step] })}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void cancelJob(j)}
                disabled={cancelling.has(j.id)}
                iconLeft={<X className="h-4 w-4" aria-hidden="true" />}
                data-testid="job-cancel"
              >
                {cancelling.has(j.id) ? t.admin_catalog.jobCancelling : t.admin_catalog.jobCancel}
              </Button>
            </div>
            {j.message && <p className="mt-1 text-xs text-muted">{j.message}</p>}
            {j.stale && (
              <p className="mt-2 flex items-start gap-2 text-xs text-warning-text" role="status" data-testid="job-stale">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {fmt(j.active ? t.admin_catalog.jobStaleHung : t.admin_catalog.jobStaleResuming, { n: j.idleMinutes })}
              </p>
            )}
            <div className="mt-2 flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={step + 1} aria-label={names[step]}>
              {fill.map((pct, i) => (
                <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
                  <span className="block h-full rounded-full bg-info" style={{ width: `${pct}%` }} />
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}
