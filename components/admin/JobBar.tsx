"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
}

const DONE = new Set(["published", "package_ready", "cancelled", "failed", "preflight_failed", "canary_failed"]);

/** Leiste über dem Katalog: laufende Generierungen mit Schritt, 5-teiligem Balken und Kosten (Werte aus dem bestehenden Auftrag). */
export function JobBar() {
  const { t } = useLocale();
  const [jobs, setJobs] = useState<Array<ListedJob & { fraction: number }>>([]);

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
            return { ...j, fraction };
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
            <p className="mt-1 text-xs text-subtle">{fmt(t.admin_catalog.jobStep, { x: step + 1, name: names[step] })}</p>
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
  );
}
