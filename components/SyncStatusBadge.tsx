"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, WifiOff } from "lucide-react";
import type { Locale } from "@/lib/types";
import { getSyncQueueSummary, onSyncQueueChanged, runSync, type SyncQueueSummary } from "@/lib/client/sync-queue";

function formatTime(iso: string | null, locale: Locale): string {
  if (!iso) return locale === "de" ? "nie" : "never";
  return new Date(iso).toLocaleString(locale === "de" ? "de-DE" : "en-US");
}

/**
 * R4.4 (roadmap.md): "Online-, Offline- und Sync-Status anzeigen" +
 * "Speicherplatz und zuletzt synchronisierten Zeitpunkt anzeigen" (den
 * Zeitpunkt-Teil; Speicherplatz bleibt auf /cert/[id]/offline, wo der
 * jeweilige Download liegt). Global im Header montiert, löst Sync bei
 * `online`-Event und beim ersten Laden aus (R4.3: "Automatisch bei online,
 * App-Start und manuellem Sync übertragen").
 */
export function SyncStatusBadge({ userId, locale }: { userId: string; locale: Locale }) {
  const [online, setOnline] = useState(true);
  const [summary, setSummary] = useState<SyncQueueSummary | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const isOnline = navigator.onLine;
      if (cancelled) return;
      setOnline(isOnline);
      if (isOnline) {
        setSyncing(true);
        const result = await runSync(userId).catch(() => null);
        if (cancelled) return;
        if (result) setSummary(result);
        setSyncing(false);
      } else {
        const result = await getSyncQueueSummary(userId).catch(() => null);
        if (!cancelled && result) setSummary(result);
      }
    })();

    function handleOnline() {
      setOnline(true);
      setSyncing(true);
      runSync(userId)
        .then((result) => {
          if (!cancelled) setSummary(result);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSyncing(false);
        });
    }
    function handleOffline() {
      setOnline(false);
    }
    function handleQueueChanged() {
      getSyncQueueSummary(userId)
        .then((result) => {
          if (!cancelled) setSummary(result);
        })
        .catch(() => {});
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const unsubscribe = onSyncQueueChanged(handleQueueChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
    };
  }, [userId]);

  async function handleManualSync() {
    setSyncing(true);
    const result = await runSync(userId).catch(() => null);
    if (result) setSummary(result);
    setSyncing(false);
  }

  const pendingTotal = (summary?.pendingCount ?? 0) + (summary?.failedCount ?? 0) + (summary?.conflictCount ?? 0);
  if (online && pendingTotal === 0 && !syncing) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium hover:bg-background"
      >
        {!online ? (
          <WifiOff className="h-4 w-4 text-foreground/60" aria-hidden="true" />
        ) : syncing ? (
          <RefreshCw className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
        ) : (
          <CloudOff className="h-4 w-4 text-amber-500" aria-hidden="true" />
        )}
        {pendingTotal > 0 && (
          <span className="rounded-full bg-accent/10 px-1.5 text-xs font-medium text-accent">
            {pendingTotal}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-md border border-border bg-surface p-3 text-sm shadow-lg">
          <p className="mb-1 font-medium">
            {online
              ? locale === "de"
                ? "Online"
                : "Online"
              : locale === "de"
                ? "Offline"
                : "Offline"}
          </p>
          <p className="mb-1 text-foreground/70">
            {locale === "de" ? "Ausstehend" : "Pending"}: {summary?.pendingCount ?? 0}
          </p>
          {summary && summary.failedCount > 0 && (
            <p className="mb-1 text-amber-600 dark:text-amber-400">
              {locale === "de" ? "Fehlgeschlagen (wird erneut versucht)" : "Failed (will retry)"}: {summary.failedCount}
            </p>
          )}
          {summary && summary.conflictCount > 0 && (
            <p className="mb-1 text-red-600 dark:text-red-400">
              {locale === "de" ? "Konflikte" : "Conflicts"}: {summary.conflictCount}
            </p>
          )}
          <p className="mb-3 text-xs text-foreground/50">
            {locale === "de" ? "Zuletzt synchronisiert" : "Last synced"}:{" "}
            {formatTime(summary?.lastSyncedAt ?? null, locale)}
          </p>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={!online || syncing}
            className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {locale === "de" ? "Jetzt synchronisieren" : "Sync now"}
          </button>
        </div>
      )}
    </div>
  );
}
