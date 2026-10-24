"use client";

import { Sparkles } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { api, useTr, type Lang } from "@/components/admin/workshop/shared";

type Kind = "quality" | "simulations" | "concepts" | "variants" | "explanations" | "prerequisites" | "formats";
type Run = {
  id: string;
  status: "running" | "done" | "failed" | "cancelled";
  total: number;
  processed: number;
  applied: number;
  skipped: number;
  failed: number;
  costUsd: number | null;
  message: string | null;
};
type Estimate = { items: number; usd: number | null; courses: number };

/**
 * Sammellauf der KI-Nachbesserung (siehe lib/server/course-editor/batch.ts): erst die Schätzung (Anzahl und Kosten), dann
 * bewusst starten; Fortschritt, Abbrechen und Ergebnis. Läuft im Hintergrund des Servers, die Seite darf geschlossen werden.
 */
export function AiBatchPanel({
  kind,
  certificationId,
  locale,
  title,
  description,
  startLabel,
  params,
  disabled,
  onFinished,
  children,
}: {
  kind: Kind;
  certificationId: string | null;
  locale: Lang;
  title: string;
  description: string;
  startLabel: string;
  params?: unknown;
  disabled?: boolean;
  onFinished?: () => void;
  children?: React.ReactNode;
}) {
  const tr = useTr(locale);
  const [run, setRun] = React.useState<Run | null>(null);
  const [estimate, setEstimate] = React.useState<Estimate | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const wasRunning = React.useRef(false);
  const query = `kind=${kind}${certificationId ? `&certificationId=${certificationId}` : ""}`;
  const running = run?.status === "running";

  const refresh = React.useCallback(async () => {
    const r = await api<{ run: Run | null }>(`/api/admin/ai-batch?${query}`);
    if (r.ok) setRun(r.data.run);
  }, [query]);

  React.useEffect(() => {
    void (async () => {
      const r = await api<{ run: Run | null }>(`/api/admin/ai-batch?${query}`);
      if (r.ok) setRun(r.data.run);
    })();
  }, [query]);

  React.useEffect(() => {
    if (running) wasRunning.current = true;
    else if (wasRunning.current) {
      wasRunning.current = false;
      onFinished?.();
    }
  }, [running, onFinished]);

  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [running, refresh]);

  async function check() {
    setBusy(true);
    setError(null);
    setEstimate(null);
    const r = await api<{ estimate: Estimate }>("/api/admin/ai-batch/estimate", { method: "POST", body: { kind, certificationId, params } });
    setBusy(false);
    if (r.ok) setEstimate(r.data.estimate);
    else setError(r.error);
  }

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api<{ runId: string }>("/api/admin/ai-batch", { method: "POST", body: { kind, certificationId, params } });
    setBusy(false);
    setEstimate(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await refresh();
  }

  async function cancel() {
    await api("/api/admin/ai-batch/cancel", { method: "POST", body: { kind, certificationId } });
    await refresh();
  }

  const usd = (v: number | null) => (v === null ? tr("Kosten unbekannt (Preis nicht hinterlegt)", "cost unknown (no price set)") : `≈ $${v.toFixed(2)}`);
  const pct = run && run.total > 0 ? (run.processed / run.total) * 100 : 0;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4" data-testid={`ai-batch-${kind}`}>
      <h3 className="flex items-center gap-2 font-semibold">
        <Sparkles className="h-4 w-4 text-violet" aria-hidden="true" />
        {title}
      </h3>
      <p className="mt-1 text-sm text-subtle">{description}</p>
      {children}

      {!running && !estimate && (
        <Button className="mt-3" size="sm" variant="secondary" onClick={() => void check()} disabled={busy || disabled} data-testid="ai-batch-check">
          {startLabel}
        </Button>
      )}

      {estimate && !running && (
        <div className="mt-3 rounded-xl border border-border-strong bg-surface-2 p-3 text-sm" role="status" data-testid="ai-batch-estimate">
          <p>
            {tr(`${estimate.items} Einträge`, `${estimate.items} items`)}
            {estimate.courses > 1 ? tr(` in ${estimate.courses} Kursen`, ` in ${estimate.courses} courses`) : ""}, {usd(estimate.usd)}.
          </p>
          <p className="mt-1 text-xs text-subtle">
            {tr(
              "Die KI-Ergebnisse werden ohne Einzelprüfung übernommen. Jede Änderung ist als Version gespeichert und lässt sich in der Kurs-Werkstatt zurücknehmen; der Lauf läuft im Hintergrund und lässt sich abbrechen.",
              "AI results are applied without individual review. Every change is saved as a version and can be undone in the course workshop; the run works in the background and can be cancelled.",
            )}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void start()} disabled={busy} data-testid="ai-batch-start">
              {tr("Jetzt starten", "Start now")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEstimate(null)} disabled={busy}>
              {tr("Abbrechen", "Cancel")}
            </Button>
          </div>
        </div>
      )}

      {running && run && (
        <div className="mt-3" role="status" data-testid="ai-batch-progress">
          <ProgressBar value={pct} label={title} />
          <p className="mt-1.5 text-sm">
            {run.processed} {tr("von", "of")} {run.total} · {run.applied} {tr("übernommen", "applied")} · {run.skipped} {tr("übersprungen", "skipped")} · {run.failed} {tr("fehlgeschlagen", "failed")}
            {run.costUsd !== null ? ` · ≈ $${run.costUsd.toFixed(2)}` : ""}
          </p>
          <Button className="mt-2" size="sm" variant="ghost" onClick={() => void cancel()} data-testid="ai-batch-cancel">
            {tr("Abbrechen", "Cancel")}
          </Button>
        </div>
      )}

      {!running && run && (
        <p className={run.status === "failed" ? "mt-3 text-sm text-danger-text" : "mt-3 text-sm text-subtle"} role="status" data-testid="ai-batch-result">
          {tr("Letzter Lauf", "Last run")}: {run.message ?? run.status}
          {run.costUsd !== null ? ` (≈ $${run.costUsd.toFixed(2)})` : ""}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          {error}
        </p>
      )}
    </section>
  );
}
