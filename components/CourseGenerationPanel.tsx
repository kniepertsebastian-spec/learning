"use client";

import { cn } from "@/lib/cn";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { SourceUrlInput } from "@/components/SourceUrlInput";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
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
  courseTitle?: string;
  createdAt?: string;
  updatedAt?: string;
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
  attempts?: number;
  validationErrorsJson?: string[];
}

const TERMINAL_STATUSES = new Set([
  "preflight_failed",
  "canary_failed",
  "circuit_breaker_open",
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

export interface PanelCategory {
  id: string;
  name: { de: string; en: string };
}

const fieldClass = "w-full rounded-md border border-border-strong bg-control px-3 py-2";

export function CourseGenerationPanel({ locale, categories = [], bare = false }: { locale: "de" | "en"; categories?: PanelCategory[]; /** ohne Kartenrahmen, z. B. im Sheet */ bare?: boolean }) {
  const { t } = useLocale();
  const ac = t.admin_catalog;
  const steps = [ac.wizBasis, ac.wizSources, ac.wizBudget, ac.wizReview];
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [courseType, setCourseType] = useState<"certification" | "custom">("certification");
  const [summary, setSummary] = useState<{ title: string; provider: string; version: string; group: string; budget: string; limit: string; autoPublish: boolean } | null>(null);
  const router = useRouter();
  const online = useOnlineStatus();
  const [job, setJob] = useState<Job | null>(null);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [pricingConfigured, setPricingConfigured] = useState(true);
  const [sourceUrlList, setSourceUrlList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [showObjectiveCosts, setShowObjectiveCosts] = useState(false);

  const active = job ? !TERMINAL_STATUSES.has(job.status) : false;

  /** Schritt wechseln; vorwärts nur, wenn die Pflichtangaben des aktuellen Schritts stimmen. */
  function goTo(target: number) {
    if (target < 0 || target > 3) return;
    const form = formRef.current;
    if (form && target > step) {
      const data = new FormData(form);
      const missingBasis = !String(data.get("courseTitle") ?? "").trim() || !String(data.get("courseDescription") ?? "").trim() || (courseType === "certification" && !String(data.get("provider") ?? "").trim());
      if (target >= 1 && missingBasis) {
        setStep(0);
        setRequestError(ac.needBasis);
        return;
      }
      if (target >= 2 && sourceUrlList.length === 0) {
        setStep(1);
        setRequestError(ac.needSource);
        return;
      }
    }
    setRequestError(null);
    if (target === 3 && form) {
      const data = new FormData(form);
      const cat = categories.find((c) => c.id === data.get("categoryId"));
      setSummary({
        title: String(data.get("courseTitle") ?? ""),
        provider: courseType === "custom" ? ac.typeCustom : String(data.get("provider") ?? ""),
        version: String(data.get("certificationVersion") ?? ""),
        group: cat ? cat.name[locale] : ac.noGroup,
        budget: String(data.get("initialCostLimitUsd") ?? ""),
        limit: String(data.get("absoluteCostLimitUsd") ?? ""),
        autoPublish: data.get("autoPublish") === "on",
      });
    }
    setStep(target);
  }

  const loadJob = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/admin/course-generation/${jobId}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { job: Job; objectives: Objective[]; pricingConfigured?: boolean };
      setJob(data.job);
      setPricingConfigured(data.pricingConfigured !== false);
      setObjectives(data.objectives);
      if (data.job.status === "published") router.refresh();
    } catch {
      // transienter Polling-Fehler - nächster Tick versucht es erneut
    }
  }, [router]);

  // Den letzten Auftrag wiederherstellen (nach Neuladen oder Seitenwechsel), sofern er nicht veröffentlicht ist:
  // so bleibt sichtbar, wo es zuletzt stand, und die Generierung lässt sich neu starten.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/course-generation", { cache: "no-store" });
        if (!response.ok) return;
        const { jobs } = (await response.json()) as { jobs: Job[] };
        const latest = jobs[0];
        if (!latest || latest.status === "published" || latest.status === "cancelled" || cancelled) return;
        await loadJob(latest.id);
      } catch {
        // ohne Wiederherstellung bleibt das Formular
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadJob]);

  useEffect(() => {
    if (!job || !active) return;
    const interval = window.setInterval(() => void loadJob(job.id), 2_000);
    return () => window.clearInterval(interval);
  }, [job, active, loadJob]);

  /** Vor dem Start geprüfte, aber fehlerhafte Quellen: der Betreiber entscheidet, ob sie entfernt werden und es weitergeht. */
  const [badSources, setBadSources] = useState<{ url: string; error: string }[] | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);

  async function createJob(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/course-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { job?: Job; error?: string };
    if (!response.ok) throw new Error(data.error ?? `Status ${response.status}`);
    if (data.job) {
      setJob(data.job);
      setShowForm(false);
      setBadSources(null);
      setPendingPayload(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setRequestError(null);
    setBadSources(null);
    const form = new FormData(event.currentTarget);
    const sourceUrls = sourceUrlList;
    if (sourceUrls.length === 0) {
      setLoading(false);
      setRequestError(locale === "de" ? "Bitte mindestens eine Quelle einfügen." : "Please add at least one source.");
      return;
    }
    const payload = {
      courseTitle: form.get("courseTitle"),
      courseDescription: form.get("courseDescription"),
      language: form.get("language"),
      courseType,
      provider: courseType === "custom" ? "" : form.get("provider"),
      certificationVersion: courseType === "custom" ? undefined : form.get("certificationVersion") || undefined,
      shortCode: String(form.get("shortCode") ?? "").trim() || undefined,
      categoryId: String(form.get("categoryId") ?? "") || undefined,
      sourceUrls,
      autoPublish: form.get("autoPublish") === "on",
      initialCostLimitUsd: Number(form.get("initialCostLimitUsd")),
      absoluteCostLimitUsd: Number(form.get("absoluteCostLimitUsd")),
    };

    try {
      // Erst die Quellen prüfen: eine kaputte soll nicht den ganzen Lauf scheitern lassen, sondern gemeldet werden.
      const check = await fetch("/api/admin/course-generation/check-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrls }),
      });
      if (check.ok) {
        const { results } = (await check.json()) as { results: { url: string; ok: boolean; error?: string }[] };
        const bad = results.filter((r) => !r.ok).map((r) => ({ url: r.url, error: r.error ?? "" }));
        if (bad.length > 0) {
          setBadSources(bad);
          setPendingPayload(payload);
          return;
        }
      }
      // Ließ sich die Prüfung selbst nicht ausführen, gilt weiter der Preflight des Auftrags.
      await createJob(payload);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Auftrag konnte nicht gestartet werden.");
    } finally {
      setLoading(false);
    }
  }

  async function continueWithoutBad() {
    if (!badSources || !pendingPayload) return;
    const bad = new Set(badSources.map((b) => b.url));
    const rest = (pendingPayload.sourceUrls as string[]).filter((u) => !bad.has(u));
    setSourceUrlList(rest);
    if (rest.length === 0) {
      setBadSources(null);
      setPendingPayload(null);
      setRequestError(locale === "de" ? "Es ist keine brauchbare Quelle übrig. Bitte andere Quellen einfügen." : "No usable source left. Please add other sources.");
      return;
    }
    setLoading(true);
    setRequestError(null);
    try {
      await createJob({ ...pendingPayload, sourceUrls: rest });
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
    <section className={bare ? "h-fit" : "h-fit rounded-xl border border-border bg-surface p-5"}>
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-link" aria-hidden="true" />
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
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4" data-testid="course-wizard">
          <ol className="flex gap-1.5" aria-label={ac.wizTitle}>
            {steps.map((name, i) => (
              <li key={name} className="flex-1">
                <button type="button" onClick={() => goTo(i)} aria-current={i === step ? "step" : undefined} data-testid={`wizard-step-${i}`} className="w-full text-left">
                  <span className={`block h-1 rounded-full ${i <= step ? "bg-accent" : "bg-track"}`} />
                  <span className={`mt-1 block text-xs ${i === step ? "font-semibold text-foreground" : "text-subtle"}`}>{i + 1} · {name}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className={step === 0 ? "space-y-3" : "hidden"}>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">{ac.trainingFor}</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={ac.trainingFor}>
                {(["certification", "custom"] as const).map((type) => (
                  <button key={type} type="button" role="radio" aria-checked={courseType === type} onClick={() => setCourseType(type)} data-testid={`course-type-${type}`}
                    className={cn("rounded-lg border px-3 py-2 text-left text-sm", courseType === type ? "border-foreground bg-surface-2" : "border-border-strong text-muted hover:text-foreground")}>
                    <span className="block font-medium">{type === "certification" ? ac.typeCertification : ac.typeCustom}</span>
                    <span className="block text-xs text-subtle">{type === "certification" ? ac.typeCertificationHint : ac.typeCustomHint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{ac.fieldTitle}</span>
              <input name="courseTitle" required placeholder={courseType === "custom" ? ac.titleCustomPlaceholder : "AWS Solutions Architect Associate"} className={fieldClass} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{ac.fieldDescription}</span>
              <textarea name="courseDescription" required rows={2} className={fieldClass} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{ac.fieldLanguage}</span>
                <select name="language" defaultValue={locale} className={fieldClass}>
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                </select>
              </label>
              {courseType === "certification" && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{ac.fieldProvider}</span>
                  <input name="provider" required placeholder="AWS" className={fieldClass} />
                </label>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {courseType === "certification" && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{ac.fieldVersion} <span className="font-normal text-faint">{ac.optional}</span></span>
                  <input name="certificationVersion" placeholder="SAA-C03" className={fieldClass} />
                </label>
              )}
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{ac.fieldShortCode} <span className="font-normal text-faint">{ac.optional}</span></span>
                <input name="shortCode" maxLength={6} placeholder="AWS" className={`${fieldClass} font-mono`} />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{ac.fieldGroup}</span>
              <select name="categoryId" defaultValue="" className={fieldClass}>
                <option value="">{ac.noGroup}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name[locale]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={step === 1 ? "space-y-2" : "hidden"}>
            <SourceUrlInput urls={sourceUrlList} onChange={setSourceUrlList} locale={locale} max={30} />
            <p className="text-xs text-faint">{fmt(ac.sourcesCount, { n: sourceUrlList.length })}</p>
          </div>

          <div className={step === 2 ? "space-y-3" : "hidden"}>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{ac.fieldBudget}</span>
                <input type="number" name="initialCostLimitUsd" defaultValue={2} min={0.1} step={0.1} className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{ac.fieldLimit}</span>
                <input type="number" name="absoluteCostLimitUsd" defaultValue={5} min={0.1} step={0.1} className={fieldClass} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="autoPublish" className="h-4 w-4" />
              <span>{ac.fieldAutoPublish}</span>
            </label>
          </div>

          {step === 3 && summary && (
            <dl className="space-y-2 rounded-xl border border-border bg-surface-inset p-4 text-sm" data-testid="wizard-summary">
              <p className="text-xs font-semibold tracking-overline text-faint uppercase">{ac.reviewTitle}</p>
              <div><dt className="text-xs text-subtle">{ac.fieldTitle}</dt><dd className="font-medium">{summary.title}</dd></div>
              <div><dt className="text-xs text-subtle">{ac.fieldProvider}</dt><dd>{summary.provider}{summary.version ? ` · ${summary.version}` : ""}</dd></div>
              <div><dt className="text-xs text-subtle">{ac.fieldGroup}</dt><dd>{summary.group}</dd></div>
              <div><dt className="text-xs text-subtle">{ac.sources}</dt><dd>{fmt(ac.sourcesCount, { n: sourceUrlList.length })}</dd></div>
              <div><dt className="text-xs text-subtle">{ac.budget}</dt><dd>$ {summary.budget} · {fmt(ac.jobLimit, { n: summary.limit })}{summary.autoPublish ? ` · ${ac.fieldAutoPublish}` : ""}</dd></div>
            </dl>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={() => goTo(step - 1)} disabled={step === 0} className="min-h-11 rounded-md border border-border-strong bg-control px-4 text-sm font-semibold hover:bg-surface-2 disabled:opacity-40">
              {ac.wizBack}
            </button>
            {step < 3 ? (
              <button type="button" onClick={() => goTo(step + 1)} data-testid="wizard-next" className="min-h-11 rounded-md bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90">
                {fmt(ac.wizNext, { name: steps[step + 1] })}
              </button>
            ) : (
              <button type="submit" disabled={loading || !online} data-testid="wizard-submit" className="flex min-h-11 items-center gap-1.5 rounded-md bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                {ac.generate}
              </button>
            )}
          </div>
        </form>
      )}

      {job && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {PHASE_LABEL[job.phase]?.[locale] ?? job.phase}
            </span>
            {active && <Loader2 className="h-3.5 w-3.5 animate-spin text-link" aria-hidden="true" />}
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

          {!active && job.status !== "published" && (
            <div className="rounded-md border border-border p-3 text-xs" data-testid="last-state">
              <p className="font-medium">{locale === "de" ? "Letzter Stand" : "Last state"}{job.courseTitle ? `: ${job.courseTitle}` : ""}</p>
              <p className="mt-1 text-foreground/70">
                {locale === "de" ? "Zuletzt in Phase" : "Last in phase"} „{PHASE_LABEL[job.phase]?.[locale] ?? job.phase}“
                {job.updatedAt ? ` · ${new Date(job.updatedAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")}` : ""}
              </p>
              {objectives.length > 0 && (
                <p className="mt-1 text-foreground/70">
                  {locale === "de"
                    ? `${validCount} von ${objectives.length} Lernzielen fertig und gespeichert${failedCount > 0 ? `, ${failedCount} fehlgeschlagen` : ""}.`
                    : `${validCount} of ${objectives.length} objectives done and saved${failedCount > 0 ? `, ${failedCount} failed` : ""}.`}
                </p>
              )}
              {objectives.filter((o) => o.status === "failed" && (o.validationErrorsJson?.length ?? 0) > 0).map((o) => (
                <div key={o.id} className="mt-2" data-testid="failed-objective">
                  <p className="font-mono font-medium">{o.code}</p>
                  <ul className="list-disc pl-4 text-red-600">
                    {o.validationErrorsJson!.slice(0, 4).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {RETRYABLE_STATUSES.has(job.status) && job.status !== "package_ready" && (
                <p className="mt-2 text-foreground/70">
                  {locale === "de"
                    ? "Mit „Generierung neu starten“ geht es dort weiter: bereits fertige Lernziele bleiben erhalten, nur das Fehlende wird neu erzeugt."
                    : "“Restart generation” continues from there: finished objectives are kept, only what is missing is generated again."}
                </p>
              )}
            </div>
          )}

          {pricingConfigured ? (
            <p className="text-xs text-foreground/50">
              {locale === "de" ? "Kosten" : "Cost"}: ~${Number(job.actualCostUsd).toFixed(4)}
              {job.estimatedCostUsd && ` (${locale === "de" ? "geschätzt" : "estimated"} ~$${Number(job.estimatedCostUsd).toFixed(4)})`}
              {" · "}
              {locale === "de" ? "Limit" : "limit"} ${job.initialCostLimitUsd}/${job.absoluteCostLimitUsd}
            </p>
          ) : (
            <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-600" data-testid="pricing-missing">
              {locale === "de"
                ? "Kosten werden nicht berechnet: Für das KI-Modell sind keine Preise hinterlegt (GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD und GEMINI_PRICE_PER_MILLION_COMPLETION_TOKENS_USD in der Server-.env). Solange greift auch das Kostenlimit nicht."
                : "Costs are not calculated: no prices are set for the AI model (GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD and GEMINI_PRICE_PER_MILLION_COMPLETION_TOKENS_USD in the server .env). The cost limit does not apply until then."}
            </p>
          )}

          {job.status === "package_ready" && (
            <p className="rounded-md bg-accent/10 p-2 text-xs text-link">
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
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
              >
                {job.status === "package_ready"
                  ? locale === "de" ? "Jetzt veröffentlichen" : "Publish now"
                  : locale === "de" ? "Generierung neu starten" : "Restart generation"}
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

      {badSources && (
        <div role="alert" className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm" data-testid="bad-sources">
          <p className="font-medium text-red-500">
            {locale === "de"
              ? `${badSources.length} Quelle(n) lassen sich nicht verwenden:`
              : `${badSources.length} source(s) cannot be used:`}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {badSources.map((b) => (
              <li key={b.url}>
                <span className="block break-all font-mono text-xs">{b.url}</span>
                <span className="block text-xs text-red-500">{b.error}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3">{locale === "de" ? "Diese Quellen entfernen und mit den übrigen fortfahren?" : "Remove these sources and continue with the rest?"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={loading} onClick={() => void continueWithoutBad()} data-testid="bad-sources-continue" className="rounded-md bg-accent px-3 py-1.5 font-medium text-on-accent disabled:opacity-50">
              {locale === "de" ? "Entfernen und fortfahren" : "Remove and continue"}
            </button>
            <button type="button" disabled={loading} onClick={() => { setBadSources(null); setPendingPayload(null); }} data-testid="bad-sources-cancel" className="rounded-md border border-border px-3 py-1.5">
              {locale === "de" ? "Abbrechen (selbst korrigieren)" : "Cancel (fix myself)"}
            </button>
          </div>
        </div>
      )}
      {requestError && <p className="mt-3 text-sm text-red-500">{requestError}</p>}
    </section>
  );
}
