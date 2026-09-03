"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Play } from "lucide-react";

interface Job {
  id: string;
  status: string;
  phase: string;
  progress: number;
  message: string | null;
  error: string | null;
}

interface GenerationEstimate {
  domainsPending: number;
  objectivesPending: number;
  estimatedAiCalls: number;
  missingObjectiveCodes: string[];
}

export function ContentGenerationControl({
  certificationId,
  locale,
  initialJob,
  initialEstimate,
}: {
  certificationId: string;
  locale: "de" | "en";
  initialJob: Job | null;
  initialEstimate: GenerationEstimate;
}) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(initialJob);
  const [estimate, setEstimate] = useState<GenerationEstimate>(initialEstimate);
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
      const data = (await response.json()) as { job: Job | null; estimate: GenerationEstimate };
      setJob(data.job);
      setEstimate(data.estimate);
      setRequestError(null);
      if (data.job?.status === "succeeded") router.refresh();
    } catch {
      setRequestError(
        locale === "de" ? "Jobstatus konnte nicht geladen werden." : "Could not load job status.",
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
          : locale === "de" ? "Job konnte nicht gestartet werden." : "Could not start job.",
      );
    } finally {
      setLoading(false);
    }
  }

  const phaseLabel =
    job?.phase === "curriculum"
      ? locale === "de" ? "Curriculum" : "Curriculum"
      : job?.phase === "lessons"
        ? locale === "de" ? "Lektionen und Fragen" : "Lessons and questions"
        : job?.phase === "complete"
          ? locale === "de" ? "Abgeschlossen" : "Complete"
          : locale === "de" ? "Vorbereitung" : "Preparing";

  return (
    <section className="mb-6 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">
            {locale === "de" ? "KI-Inhaltsgenerierung" : "AI content generation"}
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            {locale === "de"
              ? "Erzeugt fehlendes Curriculum, Lektionen und Quizfragen. Vorhandene Inhalte werden übersprungen."
              : "Generates missing curriculum, lessons, and quiz questions. Existing content is skipped."}
          </p>
        </div>
        <button
          type="button"
          onClick={startGeneration}
          disabled={loading || active}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {active || loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          {active
            ? locale === "de" ? "Generierung läuft" : "Generating"
            : job?.status === "failed"
              ? locale === "de" ? "Erneut versuchen" : "Try again"
              : locale === "de" ? "Inhalte generieren" : "Generate content"}
        </button>
      </div>

      {!active && estimate.estimatedAiCalls > 0 && (
        <p className="mt-3 text-xs text-foreground/60">
          {locale === "de"
            ? `${estimate.domainsPending} Domain(s) ohne Curriculum, ${estimate.objectivesPending} Objective(s) ohne vollständige Lektionen/Fragen – geschätzt ${estimate.estimatedAiCalls} KI-Aufrufe.`
            : `${estimate.domainsPending} domain(s) without curriculum, ${estimate.objectivesPending} objective(s) without complete lessons/questions – estimated ${estimate.estimatedAiCalls} AI calls.`}
        </p>
      )}
      {!active && estimate.estimatedAiCalls === 0 && job?.status !== "failed" && (
        <p className="mt-3 text-xs text-foreground/60">
          {locale === "de"
            ? "Alle Domains und Objectives haben bereits Inhalte."
            : "All domains and objectives already have content."}
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
          {job.message && <p className="mt-2 text-xs text-foreground/60">{job.message}</p>}

          {job.status === "succeeded" && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {locale === "de" ? "Die Lerninhalte sind bereit." : "Learning content is ready."}
            </p>
          )}
          {job.status === "failed" && (
            <div className="mt-3 rounded-md bg-red-500/10 p-3 text-sm text-red-600">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {locale === "de" ? "Generierung fehlgeschlagen" : "Generation failed"}
              </p>
              {job.error && <p className="mt-1 whitespace-pre-wrap text-xs">{job.error}</p>}
            </div>
          )}
        </div>
      )}

      {requestError && <p className="mt-3 text-sm text-red-500">{requestError}</p>}
    </section>
  );
}
