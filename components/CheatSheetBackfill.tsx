"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type CheatSheetStatusView = {
  certificationId: string;
  lessons: number;
  withCheatSheet: number;
  run: { status: "running" | "done" | "failed"; total: number; created: number; skipped: number; failed: number; message: string | null } | null;
};

const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-50";

/**
 * Merkzettel zu einem internen Lernpfad: wie viele Lektionen schon einen haben, und ein Knopf, die fehlenden mit dem
 * KI-Zugang der Firma nachträglich zu erzeugen (für Kurse, die vor dieser Funktion entstanden sind).
 */
export function CheatSheetBackfill({ courseId, initial, aiConfigured, locale }: { courseId: string; initial: CheatSheetStatusView | undefined; aiConfigured: boolean; locale: "de" | "en" }) {
  const de = locale === "de";
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = status?.run?.status === "running";

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/internal-courses/${courseId}/cheat-sheets`, { cache: "no-store" });
    if (!res.ok) return;
    const next = (await res.json()) as CheatSheetStatusView;
    setStatus(next);
    if (next.run?.status !== "running") router.refresh();
  }, [courseId, router]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [running, refresh]);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/internal-courses/${courseId}/cheat-sheets`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? (de ? "Start fehlgeschlagen." : "Could not start."));
      return;
    }
    await refresh();
  }

  if (!status || status.lessons === 0) return null;
  const missing = status.lessons - status.withCheatSheet;
  const run = status.run;

  return (
    <div className="mt-2 text-muted" data-testid="cheatsheet-backfill">
      <span data-testid="cheatsheet-count">
        {de ? `Merkzettel: ${status.withCheatSheet} von ${status.lessons} Lektionen` : `Cheat sheets: ${status.withCheatSheet} of ${status.lessons} lessons`}
      </span>
      {missing > 0 && !running && (
        <>
          {" · "}
          <button type="button" className={`${btn} ml-1`} disabled={busy || !aiConfigured} title={aiConfigured ? undefined : de ? "Dafür ist ein KI-Zugang nötig (KI-Zugang einrichten)" : "An AI access is required"} onClick={() => void start()} data-testid="cheatsheet-start">
            {de ? `Fehlende ${missing} nacherzeugen` : `Generate the ${missing} missing`}
          </button>
        </>
      )}
      {running && run && (
        <span className="ml-2" role="status" data-testid="cheatsheet-progress">
          {de ? `läuft … ${run.created + run.skipped + run.failed} von ${run.total}` : `running … ${run.created + run.skipped + run.failed} of ${run.total}`}
        </span>
      )}
      {!running && run && (run.status === "failed" || run.message) && (
        <p className={run.status === "failed" ? "mt-1 text-red-600" : "mt-1"} role="status">
          {run.message ?? (de ? "Der letzte Lauf ist fehlgeschlagen." : "The last run failed.")}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
