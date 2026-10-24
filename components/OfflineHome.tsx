"use client";

import { useEffect, useState } from "react";
import { BookOpen, RefreshCw } from "lucide-react";
import { OfflinePackageManager } from "@/components/OfflinePackageManager";
import { Button } from "@/components/ui/button";
import { getLastUserId } from "@/lib/client/last-user";
import { isOfflineStorageSupported, listOfflinePackages, type StoredOfflinePackage } from "@/lib/client/offline-db";
import { UnsyncedNotice } from "@/components/UnsyncedNotice";
import { formatAge, oldestAgeMs } from "@/lib/pwa/unsynced";
import { getSyncQueueSummary, onSyncQueueChanged, runSync } from "@/lib/client/sync-queue";
import { useOnlineStatus } from "@/lib/client/use-online-status";
import { useLocale } from "@/lib/i18n";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Einstieg ohne Server (roadmap_pwa Phase 2): liest die Pakete des zuletzt angemeldeten Nutzers aus IndexedDB und öffnet den
 * Offline-Leser (`OfflinePackageManager`). Lernergebnisse landen in der Sync-Warteschlange und gehen online hoch.
 */
export function OfflineHome() {
  const { t, locale } = useLocale();
  const online = useOnlineStatus();
  const [state, setState] = useState<{ userId: string | null; packages: StoredOfflinePackage[] } | null>(null);
  const [selected, setSelected] = useState<StoredOfflinePackage | null>(null);
  const [pending, setPending] = useState(0);
  const [oldestAt, setOldestAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = getLastUserId();
      const packages = userId && isOfflineStorageSupported() ? await listOfflinePackages(userId).catch(() => []) : [];
      if (!cancelled) setState({ userId, packages });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const userId = getLastUserId();
      if (!userId) return;
      const summary = await getSyncQueueSummary(userId).catch(() => null);
      if (summary && !cancelled) {
        setPending(summary.pendingCount + summary.failedCount);
        setOldestAt(summary.oldestUnsyncedAt);
      }
    };
    void load();
    const unsubscribe = onSyncQueueChanged(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function syncNow() {
    if (!state?.userId) return;
    setSyncing(true);
    await runSync(state.userId).catch(() => null);
    setSyncing(false);
  }

  if (!state) return <p className="text-sm text-subtle">…</p>;

  if (selected && state.userId) {
    return (
      <div data-testid="offline-reader">
        <button type="button" onClick={() => setSelected(null)} className="mb-4 text-sm text-foreground/70 hover:text-foreground">
          {t.pwa.offlineBack}
        </button>
        <OfflinePackageManager certificationId={selected.certificationId} certSlug={selected.certSlug} certName={selected.certName} userId={state.userId} locale={locale} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="offline-home">
      <h1 className="text-2xl font-semibold">{t.pwa.offlineTitle}</h1>
      {state.userId && <UnsyncedNotice userId={state.userId} locale={locale} />}
      {!state.userId ? (
        <>
          <p className="text-sm text-subtle">{t.pwa.offlineNoUser}</p>
          <div><Button asChild><a href="/login">{t.pwa.offlineLogin}</a></Button></div>
        </>
      ) : state.packages.length === 0 ? (
        <p className="text-sm text-subtle">{t.pwa.offlineEmpty}</p>
      ) : (
        <>
          <p className="text-sm text-subtle">{t.pwa.offlineIntro}</p>
          <ul className="flex flex-col gap-2">
            {state.packages.map((pkg) => (
              <li key={pkg.key} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{pkg.certName}</span>
                  <span className="block text-xs text-subtle">{formatBytes(pkg.sizeBytes)} · {t.pwa.offlineSaved} {new Date(pkg.downloadedAt).toLocaleDateString(locale === "de" ? "de-DE" : "en-US")}</span>
                </span>
                <Button size="sm" onClick={() => setSelected(pkg)} iconLeft={<BookOpen className="h-4 w-4" aria-hidden="true" />} data-testid="open-offline-course">
                  {t.pwa.offlineOpen}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {pending > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-inset p-3 text-sm" data-testid="offline-pending">
          <span>{pending} {t.pwa.offlinePending}</span>
          {oldestAt && oldestAgeMs(oldestAt, new Date()) !== null && (
            <span className="text-subtle" data-testid="offline-oldest-pending">
              {locale === "de" ? "Ältestes unübertragenes Ergebnis" : "Oldest result not uploaded"}: {formatAge(oldestAgeMs(oldestAt, new Date()) ?? 0, locale)}
            </span>
          )}
          {online && (
            <Button size="sm" variant="secondary" onClick={() => void syncNow()} disabled={syncing} iconLeft={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
              {t.pwa.offlineSync}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
