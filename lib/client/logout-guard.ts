import { getSyncQueueSummary, runSync, type SyncQueueSummary } from "@/lib/client/sync-queue";

interface LogoutGuardDeps {
  isOnline: () => boolean;
  sync: (userId: string) => Promise<SyncQueueSummary>;
  summary: (userId: string) => Promise<SyncQueueSummary>;
}

const defaultDeps: LogoutGuardDeps = {
  isOnline: () => typeof navigator === "undefined" || navigator.onLine,
  sync: runSync,
  summary: getSyncQueueSummary,
};

/**
 * Roadmap PWA Phase 1: Beim Logout werden ausstehende Lernergebnisse nicht
 * stillschweigend gelöscht. Erst wird (online) synchronisiert; die Rückgabe
 * ist die Zahl der Ereignisse, die danach noch nicht übertragen sind
 * (ausstehend, fehlgeschlagen oder im Konflikt). 0 heißt: gefahrlos abmelden.
 */
export async function countUnsyncedBeforeLogout(
  userId: string,
  deps: LogoutGuardDeps = defaultDeps,
): Promise<number> {
  let summary: SyncQueueSummary;
  try {
    summary = deps.isOnline() ? await deps.sync(userId) : await deps.summary(userId);
  } catch {
    // Sync-Versuch fehlgeschlagen: den tatsächlichen Stand der Warteschlange prüfen.
    try {
      summary = await deps.summary(userId);
    } catch {
      return 0; // Warteschlange nicht lesbar (z. B. IndexedDB gesperrt) - Logout nicht blockieren.
    }
  }
  return summary.pendingCount + summary.failedCount + summary.conflictCount;
}
