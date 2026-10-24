"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { isUninstalledIosSafari } from "@/lib/client/install-prompt";
import { getSyncQueueSummary, onSyncQueueChanged } from "@/lib/client/sync-queue";
import { unsyncedWarning, type UnsyncedWarning } from "@/lib/pwa/unsynced";
import type { Locale } from "@/lib/types";

/**
 * Datenintegrität über Zeit (roadmap_datenintegritaet.md, Phase 2): Auf iPhone/iPad in Safari ohne Installation kann der
 * Browser den Speicher der Website nach etwa einer Woche ohne Nutzung räumen. Liegen Ergebnisse länger als 24 Stunden
 * unübertragen, erscheint ein deutlicher Hinweis (Kopf der App und `/offline`).
 */
export function UnsyncedNotice({ userId, locale }: { userId: string; locale: Locale }) {
  const [warning, setWarning] = useState<UnsyncedWarning | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const summary = await getSyncQueueSummary(userId).catch(() => null);
      if (cancelled || !summary) return;
      setWarning(unsyncedWarning({ count: summary.pendingCount + summary.failedCount, oldestUnsyncedAt: summary.oldestUnsyncedAt, standalone: false, iosSafari: isUninstalledIosSafari(), now: new Date() }));
    };
    void load();
    const unsubscribe = onSyncQueueChanged(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  if (!warning) return null;
  const de = locale === "de";
  return (
    <div role="alert" data-testid="unsynced-notice" className="flex items-start gap-3 rounded-lg border border-warning-text/40 bg-surface p-3 text-sm">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
      <p>
        {de
          ? `${warning.count} ${warning.count === 1 ? "Ergebnis ist" : "Ergebnisse sind"} noch nicht übertragen. Öffne die App, sobald du Netz hast. Safari kann nicht installierte Web-Apps nach einer Woche löschen.`
          : `${warning.count} ${warning.count === 1 ? "result is" : "results are"} not uploaded yet. Open the app as soon as you have a connection. Safari can delete web apps that are not installed after a week.`}
      </p>
    </div>
  );
}
