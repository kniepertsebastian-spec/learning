"use client";

import { c_syncStatusBadge } from "@/lib/i18n/components/syncStatusBadge";
import { fill } from "@/lib/i18n/fill";
import { useEffect, useId, useState } from "react";
import { CloudOff, RefreshCw, WifiOff } from "lucide-react";
import type { Locale } from "@/lib/types";
import type { PendingSyncEvent } from "@/lib/client/offline-db";
import { discardPendingSyncEvent, getSyncQueueSummary, listRejectedSyncEvents, listenForBackgroundSync, onSyncQueueChanged, runSync, type SyncQueueSummary } from "@/lib/client/sync-queue";

function formatTime(iso: string | null, locale: Locale): string {
  if (!iso) return c_syncStatusBadge(locale).never;
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
  const [rejected, setRejected] = useState<PendingSyncEvent[] | null>(null);
  const panelId = useId();

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
    const stopBackground = listenForBackgroundSync();
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
      stopBackground();
    };
  }, [userId]);

  async function handleManualSync() {
    setSyncing(true);
    const result = await runSync(userId).catch(() => null);
    if (result) setSummary(result);
    setSyncing(false);
  }

  const pendingTotal = (summary?.pendingCount ?? 0) + (summary?.failedCount ?? 0) + (summary?.conflictCount ?? 0) + (summary?.rejectedCount ?? 0);
  const showRejected = async () => setRejected(rejected ? null : await listRejectedSyncEvents(userId).catch(() => []));
  const discardRejected = async () => {
    for (const event of rejected ?? []) await discardPendingSyncEvent(event.clientEventId);
    setRejected(null);
  };
  if (online && pendingTotal === 0 && !syncing && !summary?.partialApplied) return null;

  // Das Icon ist aria-hidden: der Name sagt, was es zeigt (offline / Sync läuft) und wie viel noch aussteht.
  const texts = c_syncStatusBadge(locale);
  const labelParts = [
    !online ? texts.offline : syncing ? texts.syncing : null,
    pendingTotal > 0 ? fill(texts.n0Pending, pendingTotal) : null,
  ].filter(Boolean);
  const buttonLabel = `${texts.buttonLabel}: ${labelParts.length > 0 ? labelParts.join(", ") : texts.notice}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-testid="sync-status-button"
        // Mobil mindestens 44 × 44 px Tippfläche, ab sm die kompakte Größe der Kopfleiste.
        className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium hover:bg-background sm:min-h-9 sm:min-w-9"
      >
        {!online ? (
          <WifiOff className="h-4 w-4 text-subtle" aria-hidden="true" />
        ) : syncing ? (
          <RefreshCw className="h-4 w-4 animate-spin text-link" aria-hidden="true" />
        ) : (
          <CloudOff className="h-4 w-4 text-warning-text" aria-hidden="true" />
        )}
        {pendingTotal > 0 && (
          <span className="rounded-full bg-accent-soft px-1.5 text-xs font-medium text-link">
            {pendingTotal}
          </span>
        )}
      </button>

      {open && (
        <div id={panelId} className="absolute right-0 top-full z-30 mt-2 w-64 rounded-md border border-border bg-surface p-3 text-sm shadow-overlay">
          <p className="mb-1 font-medium">
            {online
              ? c_syncStatusBadge(locale).online
              : c_syncStatusBadge(locale).offline}
          </p>
          <p className="mb-1 text-muted">
            {c_syncStatusBadge(locale).pending}: {summary?.pendingCount ?? 0}
          </p>
          {summary?.authRequired && (
            <p className="mb-1 text-warning-text" data-testid="sync-auth-required">
              {c_syncStatusBadge(locale).signInNeededSignIn}
            </p>
          )}
          {summary && summary.failedCount > 0 && (
            <p className="mb-1 text-warning-text dark:text-warning-text">
              {c_syncStatusBadge(locale).failedWillRetry}: {summary.failedCount}
            </p>
          )}
          {summary?.partialApplied ? (
            <p className="mb-1 text-muted" data-testid="sync-partial-note">
              {c_syncStatusBadge(locale).sessionWasAlreadyCompletedYour}
            </p>
          ) : null}
          {summary?.skippedAnswers ? (
            <p className="mb-1 text-muted" data-testid="sync-skipped-note">
              {fill(c_syncStatusBadge(locale).n0AnswerSWereFor, summary.skippedAnswers)}
            </p>
          ) : null}
          {summary && summary.rejectedCount > 0 && (
            <div className="mb-2" data-testid="sync-rejected">
              <p className="mb-1 text-danger-text">
                {fill(c_syncStatusBadge(locale).n0ResultsCouldNotBe, summary.rejectedCount)}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void showRejected()} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-background">{c_syncStatusBadge(locale).view}</button>
                <button type="button" onClick={() => void discardRejected().then(() => getSyncQueueSummary(userId).then(setSummary))} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-background" data-testid="sync-rejected-discard">{c_syncStatusBadge(locale).discard}</button>
              </div>
              {rejected && (
                <ul className="mt-2 flex flex-col gap-1 text-xs text-muted" data-testid="sync-rejected-list">
                  {rejected.map((e) => (
                    <li key={e.clientEventId}>{e.label} · {formatTime(e.createdAt, locale)}{e.lastError ? ` · ${e.lastError}` : ""}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {summary && summary.conflictCount > 0 && (
            <p className="mb-1 text-danger-text dark:text-danger-text">
              {c_syncStatusBadge(locale).conflicts}: {summary.conflictCount}
            </p>
          )}
          <p className="mb-3 text-xs text-faint">
            {c_syncStatusBadge(locale).lastSynced}:{" "}
            {formatTime(summary?.lastSyncedAt ?? null, locale)}
          </p>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={!online || syncing}
            className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {c_syncStatusBadge(locale).syncNow}
          </button>
        </div>
      )}
    </div>
  );
}
