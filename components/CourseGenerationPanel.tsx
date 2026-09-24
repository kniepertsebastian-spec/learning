"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useOnlineStatus } from "@/lib/client/use-online-status";

interface Job {
  id: string;
  status: string;
  phase: string;
  message: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  estimatedCostUsd: string | null;
  actualCostUsd: string;
  initialCostLimitUsd: string;
  absoluteCostLimitUsd: string;
  autoPublish: boolean;
  resultCertificationId: string | null;
}

interface Objective {
  id: string;
  code: string;
  status: string;
  isCanary: boolean;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: string | null;
}

const TERMINAL_STATUSES = new Set([
  "preflight_failed",
  "canary_failed",
  "package_ready",
  "published",
  "cost_limit_reached",
  "failed",
  "cancelled",
]);

const RETRYABLE_STATUSES = new Set([
  "preflight_failed",
  "canary_failed",
  "circuit_breaker_open",
  "cost_limit_reached",
  "failed",
  "package_ready",
]);

const PHASE_LABEL: Record<string, { de: string; en: string }> = {
  queued: { de: "Auftrag angenommen", en: "Job accepted" },
  preflight: { de: "Technischer Preflight", en: "Technical preflight" },
  blueprint: { de: "Blueprint wird erstellt", en: "Blueprint is being created" },
  canary: { de: "Canary-Lernziel wird geprüft", en: "Canary objective is being checked" },
  content: { de: "Lernziele werden ausgearbeitet", en: "Objectives are being generated" },
};

export function CourseGenerationPanel({ locale }: { locale: "de" | "en" }) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [job, setJob] = useState<Job | null>(null);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [showObjectiveCosts, setShowObjectiveCosts] = useState(false);

  const active = job ? !TERMINAL_STATUSES.has(job.status) : false;

  const loadJob = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/admin/course-generation/${jobId}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { job: Job; objectives: Objective[] };
      setJob(data.job);
      setObjectives(data.objectives);
      if (data.job.status === "published") router.refresh();
    } catch {
      // transienter Polling-Fehler - nächster Tick versucht es erneut
    }
  }, [router]);

  useEffect(() => {
    if (!job || !active) return;
    const interval = window.setInterval(() => void loadJob(job.id), 2_000);
    return () => window.clearInterval(interval);
  }, [job, active, loadJob]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setRequestError(null);
    const form = new FormData(event.currentTarget);
    const sourceUrls = String(form.get("sourceUrls") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    try {
      const response = await fetch("/api/admin/course-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseTitle: form.get("courseTitle"),
          courseDescription: form.get("courseDescription"),
          language: form.get("language"),
          provider: form.get("provider"),
          certificationVersion: form.get("certificationVersion") || undefined,
          sourceUrls,
          autoPublish: form.get("autoPublish") === "on",
          initialCostLimitUsd: Number(form.get("initialCostLimitUsd")),
          absoluteCostLimitUsd: Number(form.get("absoluteCostLimitUsd")),
        }),
      });
      const data = (await response.json()) as { job?: Job; error?: string };
      if (!response.ok) throw new Error(data.error ?? `Status ${response.status}`);
      if (data.job) {
        setJob(data.job);
        setShowForm(false);
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Auftrag konnte nicht gestartet werden.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!job) return;
    await fetch(`/api/admin/course-generation/${job.id}/cancel`, { method: "POST" });
    void loadJob(job.id);
  }

  async function handleRetry() {
    if (!job) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/course-generation/${job.id}/retry`, { method: "POST" });
      const data = (await response.json()) as { job?: Job; error?: string };
      if (!response.ok) throw new Error(data.error ?? `Status ${response.status}`);
      if (data.job) setJob(data.job);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Retry fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  function handleNewJob() {
    setJob(null);
    setObjectives([]);
    setShowForm(true);
  }

  const validCount = objectives.filter((o) => o.status === "valid").length;
  const failedCount = objectives.filter((o) => o.status === "failed").length;

  return (
    <section className="h-fit rounded-xl border border-border bg-surface p-5">
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
        <h2 className="text-lg font-semibold">
          {locale === "de" ? "Kurs automatisch generieren" : "Generate course automatically"}
        </h2>
      </div>
      <p className="mb-4 text-sm text-foreground/60">
        {locale === "de"
          ? "Ein Klick erzeugt Blueprint, Lektionen und Fragen vollautomatisch aus offiziellen Quellen (course_generation.md)."
          : "One click generates the blueprint, lessons, and questions fully automatically from official sources (course_generation.md)."}
      </p>

      {!online && (
        <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
          {locale === "de"
            ? "Die Kursgenerierung benötigt eine Verbindung."
            : "Course generation requires a connection."}
        </p>
      )}

      {showForm && !job && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{locale === "de" ? "Titel" : "Title"}</span>
            <input
              name="courseTitle"
              required
              placeholder="AWS Solutions Architect Associate"
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{locale === "de" ? "Beschreibung" : "Description"}</span>
            <textarea
              name="courseDescription"
              required
              rows={2}
              placeholder={locale === "de" ? "Kurze Beschreibung des Kurses" : "Short description of the course"}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{locale === "de" ? "Sprache" : "Language"}</span>
              <select name="language" defaultValue={locale} className="w-full rounded-md border border-border bg-background px-3 py-2">
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Provider</span>
              <input name="provider" required placeholder="AWS" className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {locale === "de" ? "Zertifizierungsversion" : "Certification version"}
              <span className="ml-1 font-normal text-foreground/40">{locale === "de" ? "optional" : "optional"}</span>
            </span>
            <input name="certificationVersion" placeholder="SAA-C03" className="w-full rounded-md border border-border bg-background px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {locale === "de" ? "Quellen-URLs" : "Source URLs"}
              <span className="ml-1.5 font-normal text-foreground/50">
                {locale === "de" ? "- eine pro Zeile, PDF oder Webseite" : "- one per line, PDF or web page"}
              </span>
            </span>
            <textarea
              name="sourceUrls"
              required
              rows={3}
              placeholder="https://example.org/exam-guide.pdf"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{locale === "de" ? "Zielbudget (USD)" : "Target budget (USD)"}</span>
              <input
                type="number"
                name="initialCostLimitUsd"
                defaultValue={2}
                min={0.1}
                step={0.1}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{locale === "de" ? "Sicherheitslimit (USD)" : "Safety limit (USD)"}</span>
              <input
                type="number"
                name="absoluteCostLimitUsd"
                defaultValue={5}
                min={0.1}
                step={0.1}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="autoPublish" className="h-4 w-4" />
            <span>
              {locale === "de"
                ? "Automatisch veröffentlichen nach erfolgreicher Validierung"
                : "Auto-publish after successful validation"}
            </span>
          </label>
          <button
            type="submit"
            disabled={loading || !online}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {locale === "de" ? "Kurs generieren" : "Generate course"}
          </button>
        </form>
      )}

      {job && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {PHASE_LABEL[job.phase]?.[locale] ?? job.phase}
            </span>
            {active && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden="true" />}
          </div>
          {job.message && <p className="text-xs text-foreground/60">{job.message}</p>}

          {objectives.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowObjectiveCosts((v) => !v)}
                className="text-xs text-foreground/50 underline decoration-dotted hover:text-foreground/80"
              >
                {locale === "de"
                  ? `${validCount}/${objectives.length} Lernziel(e) fertig${failedCount > 0 ? `, ${failedCount} fehlgeschlagen` : ""}`
                  : `${validCount}/${objectives.length} objective(s) done${failedCount > 0 ? `, ${failedCount} failed` : ""}`}
                {" "}
                {showObjectiveCosts
                  ? locale === "de" ? "(Details ausblenden)" : "(hide details)"
                  : locale === "de" ? "(Details/Kosten anzeigen)" : "(show details/cost)"}
              </button>
              {showObjectiveCosts && (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="text-foreground/50">
                        <th className="px-2 py-1 font-medium">Code</th>
                        <th className="px-2 py-1 font-medium">{locale === "de" ? "Status" : "Status"}</th>
                        <th className="px-2 py-1 text-right font-medium">Tokens</th>
                        <th className="px-2 py-1 text-right font-medium">
                          {locale === "de" ? "Kosten" : "Cost"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {objectives.map((o) => (
                        <tr key={o.id} className="border-t border-border/60">
                          <td className="px-2 py-1 font-mono">
                            {o.code}
                            {o.isCanary && " 🐤"}
                          </td>
                          <td className="px-2 py-1">{o.status}</td>
                          <td className="px-2 py-1 text-right">
                            {(o.inputTokens + o.outputTokens).toLocaleString(locale)}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {o.costUsd !== null ? `$${Number(o.costUsd).toFixed(4)}` : "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-foreground/50">
            {locale === "de" ? "Kosten" : "Cost"}: ~${Number(job.actualCostUsd).toFixed(4)}
            {job.estimatedCostUsd && ` (${locale === "de" ? "geschätzt" : "estimated"} ~$${Number(job.estimatedCostUsd).toFixed(4)})`}
            {" · "}
            {locale === "de" ? "Limit" : "limit"} ${job.initialCostLimitUsd}/${job.absoluteCostLimitUsd}
          </p>

          {job.status === "package_ready" && (
            <p className="rounded-md bg-accent/10 p-2 text-xs text-accent">
              {locale === "de"
                ? "Kurs vollständig generiert und validiert - wartet auf manuelle Freigabe."
                : "Course fully generated and validated - waiting for manual approval."}
            </p>
          )}
          {job.status === "published" && (
            <p className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {locale === "de" ? "Kurs veröffentlicht." : "Course published."}
            </p>
          )}
          {(job.status === "failed" ||
            job.status === "preflight_failed" ||
            job.status === "canary_failed" ||
            job.status === "circuit_breaker_open" ||
            job.status === "cost_limit_reached") && (
            <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-600">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {job.errorMessage ?? job.status}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {active && (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-background"
              >
                {locale === "de" ? "Abbrechen" : "Cancel"}
              </button>
            )}
            {!active && RETRYABLE_STATUSES.has(job.status) && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={loading}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {job.status === "package_ready"
                  ? locale === "de" ? "Jetzt veröffentlichen" : "Publish now"
                  : locale === "de" ? "Erneut versuchen" : "Retry"}
              </button>
            )}
            {!active && (
              <button
                type="button"
                onClick={handleNewJob}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-background"
              >
                {locale === "de" ? "Neuer Auftrag" : "New job"}
              </button>
            )}
          </div>
        </div>
      )}

      {requestError && <p className="mt-3 text-sm text-red-500">{requestError}</p>}
    </section>
  );
}
