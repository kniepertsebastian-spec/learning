"use client";

import { c_contentGenerationControl } from "@/lib/i18n/components/contentGenerationControl";
import { fill } from "@/lib/i18n/fill";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Play } from "lucide-react";
import { useOnlineStatus } from "@/lib/client/use-online-status";

interface Job {
  id: string;
  status: string;
  phase: string;
  progress: number;
  message: string | null;
  error: string | null;
  errorClass: string | null;
  /** R6 (roadmap.md): "Modell, Tokenverbrauch und geschätzte Kosten pro
   * Job" - model ist erst gesetzt, sobald der erste Claude-Aufruf
   * zurückkam, totalTokens/estimatedCostUsd wachsen live mit (siehe
   * trackUsageLine() in content-generation.ts). */
  model: string | null;
  totalTokens: number;
  estimatedCostUsd: string | null;
}

/** R0.1 (roadmap.md): Ursache + sinnvoller nächster Schritt pro Fehlerklasse,
 * statt nur den rohen Skript-Output zu zeigen. */
const ERROR_CLASS_INFO: Record<string, { de: [string, string]; en: [string, string] }> = {
  schema: {
    de: ["Antwortformat-Fehler", "Die KI-Antwort passte nicht ins erwartete Format. Oft hilft ein erneuter Versuch."],
    en: ["Response format error", "The AI response didn't match the expected format. Often fixed by retrying."],
  },
  rate_limit: {
    de: ["Rate Limit erreicht", "Kurzfristiges Limit der KI-API. In ein paar Minuten erneut versuchen."],
    en: ["Rate limit reached", "Short-term AI API limit. Try again in a few minutes."],
  },
  quota: {
    de: ["Tageskontingent erschöpft", "Das tägliche Kontingent der KI-API ist aufgebraucht. Morgen erneut versuchen oder Kontingent erhöhen."],
    en: ["Daily quota exhausted", "The AI API's daily quota is used up. Try again tomorrow or increase the quota."],
  },
  provider_outage: {
    de: ["KI-Anbieter nicht erreichbar", "Vorübergehendes Problem beim KI-Anbieter. In Kürze erneut versuchen."],
    en: ["AI provider unavailable", "Temporary problem at the AI provider. Try again shortly."],
  },
  internal: {
    de: ["Interner Fehler", "Unerwarteter Fehler in der Anwendung. Bei wiederholtem Auftreten die Logs prüfen."],
    en: ["Internal error", "Unexpected application error. Check the logs if this keeps happening."],
  },
};

interface GenerationEstimate {
  domainsPending: number;
  objectivesPending: number;
  estimatedAiCalls: number;
  missingObjectiveCodes: string[];
}

interface AiBudgetStatus {
  limitUsd: number;
  spentUsd: number;
  exceeded: boolean;
}

export function ContentGenerationControl({
  certificationId,
  locale,
  initialJob,
  initialEstimate,
  initialBudget,
}: {
  certificationId: string;
  locale: "de" | "en";
  initialJob: Job | null;
  initialEstimate: GenerationEstimate;
  initialBudget: AiBudgetStatus | null;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [job, setJob] = useState<Job | null>(initialJob);
  const [estimate, setEstimate] = useState<GenerationEstimate>(initialEstimate);
  const [budget, setBudget] = useState<AiBudgetStatus | null>(initialBudget);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const active = job?.status === "queued" || job?.status === "running";

  const loadJob = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/certifications/${certificationId}/generate`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = (await response.json()) as {
        job: Job | null;
        estimate: GenerationEstimate;
        budget: AiBudgetStatus | null;
      };
      setJob(data.job);
      setEstimate(data.estimate);
      setBudget(data.budget);
      setRequestError(null);
      if (data.job?.status === "succeeded") router.refresh();
    } catch {
      setRequestError(
        c_contentGenerationControl(locale).couldNotLoadJobStatus,
      );
    } finally {
      setLoading(false);
    }
  }, [certificationId, locale, router]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => void loadJob(), 2_000);
    return () => window.clearInterval(interval);
  }, [active, loadJob]);

  async function startGeneration() {
    setLoading(true);
    setRequestError(null);
    try {
      const response = await fetch(
        `/api/admin/certifications/${certificationId}/generate`,
        { method: "POST" },
      );
      const data = (await response.json()) as { job?: Job; error?: string };
      if (!response.ok && response.status !== 409) {
        throw new Error(data.error ?? `Status ${response.status}`);
      }
      if (data.job) setJob(data.job);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : c_contentGenerationControl(locale).couldNotStartJob,
      );
    } finally {
      setLoading(false);
    }
  }

  const phaseLabel =
    job?.phase === "curriculum"
      ? c_contentGenerationControl(locale).curriculum
      : job?.phase === "lessons"
        ? c_contentGenerationControl(locale).lessonsAndQuestions
        : job?.phase === "complete"
          ? c_contentGenerationControl(locale).complete
          : c_contentGenerationControl(locale).preparing;

  return (
    <section className="mb-6 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">
            {c_contentGenerationControl(locale).aiContentGeneration}
          </h2>
          <p className="mt-1 text-sm text-subtle">
            {c_contentGenerationControl(locale).generatesMissingCurriculumLessonsAnd}
          </p>
        </div>
        <button
          type="button"
          onClick={startGeneration}
          disabled={loading || active || !online || budget?.exceeded === true}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {active || loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          {active
            ? c_contentGenerationControl(locale).generating
            : job?.status === "failed"
              ? c_contentGenerationControl(locale).tryAgain
              : c_contentGenerationControl(locale).generateContent}
        </button>
      </div>

      {/* R6 (roadmap.md): "Budgetgrenzen" - blockt nur neue Jobs, bereits
          erzeugte Inhalte bleiben unabhängig davon verfügbar. */}
      {budget && (
        <p
          className={`mt-3 text-xs ${budget.exceeded ? "text-danger-text dark:text-danger-text" : "text-subtle"}`}
        >
          {fill(c_contentGenerationControl(locale).aiBudget0Of1, budget.spentUsd.toFixed(2), budget.limitUsd.toFixed(2))}
          {budget.exceeded &&
            (c_contentGenerationControl(locale).newGenerationsAreBlockedExisting)}
        </p>
      )}

      {/* R4.4 (roadmap.md): "Generierung ... ausdrücklich nicht offline anbieten". */}
      {!online && (
        <p className="mt-3 text-xs text-warning-text dark:text-warning-text">
          {c_contentGenerationControl(locale).aiContentGenerationRequiresA}
        </p>
      )}

      {!active && estimate.estimatedAiCalls > 0 && (
        <p className="mt-3 text-xs text-subtle">
          {fill(c_contentGenerationControl(locale).n0DomainSWithoutCurriculum, estimate.domainsPending, estimate.objectivesPending, estimate.estimatedAiCalls)}
        </p>
      )}
      {!active && estimate.estimatedAiCalls === 0 && job?.status !== "failed" && (
        <p className="mt-3 text-xs text-subtle">
          {c_contentGenerationControl(locale).allDomainsAndObjectivesAlready}
        </p>
      )}

      {job && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium">{phaseLabel}</span>
            <span>{job.progress}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-background"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.progress}
          >
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          {job.message && <p className="mt-2 text-xs text-subtle">{job.message}</p>}

          {job.totalTokens > 0 && (
            <p className="mt-1 text-xs text-faint">
              {job.model && <span className="font-mono">{job.model}</span>}
              {job.model && " · "}
              {job.totalTokens.toLocaleString(locale)} {c_contentGenerationControl(locale).tokens}
              {job.estimatedCostUsd !== null &&
                ` · ~$${Number(job.estimatedCostUsd).toFixed(4)}`}
            </p>
          )}

          {job.status === "succeeded" && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-success-text">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {c_contentGenerationControl(locale).learningContentIsReady}
            </p>
          )}
          {job.status === "failed" && (() => {
            const info = job.errorClass ? ERROR_CLASS_INFO[job.errorClass] : undefined;
            const [title, hint] = info
              ? info[locale]
              : [
                  c_contentGenerationControl(locale).generationFailed,
                  undefined,
                ];
            return (
              <div className="mt-3 rounded-md bg-danger-soft p-3 text-sm text-danger-text">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  {title}
                </p>
                {hint && <p className="mt-1 text-xs text-danger-text/90">{hint}</p>}
                {job.error && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-danger-text/70">
                      {c_contentGenerationControl(locale).technicalDetails}
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap text-xs">{job.error}</p>
                  </details>
                )}
                <p className="mt-2 text-xs text-danger-text/70">
                  {c_contentGenerationControl(locale).tryAgainAboveOnlyRedoes}
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {requestError && <p className="mt-3 text-sm text-danger-text">{requestError}</p>}
    </section>
  );
}
