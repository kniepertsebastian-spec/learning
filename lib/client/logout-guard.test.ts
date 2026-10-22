import { describe, expect, it, vi } from "vitest";
import { countUnsyncedBeforeLogout } from "@/lib/client/logout-guard";
import type { SyncQueueSummary } from "@/lib/client/sync-queue";

const summary = (p: number, f = 0, c = 0): SyncQueueSummary => ({
  pendingCount: p,
  failedCount: f,
  conflictCount: c,
  lastSyncedAt: null,
});

describe("countUnsyncedBeforeLogout", () => {
  it("synchronisiert online und liefert 0, wenn alles übertragen ist", async () => {
    const sync = vi.fn().mockResolvedValue(summary(0));
    const result = await countUnsyncedBeforeLogout("u", { isOnline: () => true, sync, summary: vi.fn() });
    expect(result).toBe(0);
    expect(sync).toHaveBeenCalledWith("u");
  });

  it("zählt nach dem Sync verbliebene Ereignisse aller Status", async () => {
    const sync = vi.fn().mockResolvedValue(summary(1, 2, 3));
    expect(await countUnsyncedBeforeLogout("u", { isOnline: () => true, sync, summary: vi.fn() })).toBe(6);
  });

  it("versucht offline keinen Sync, sondern liest nur die Warteschlange", async () => {
    const sync = vi.fn();
    const read = vi.fn().mockResolvedValue(summary(2));
    expect(await countUnsyncedBeforeLogout("u", { isOnline: () => false, sync, summary: read })).toBe(2);
    expect(sync).not.toHaveBeenCalled();
  });

  it("fällt bei Sync-Fehler auf den Warteschlangenstand zurück", async () => {
    const sync = vi.fn().mockRejectedValue(new Error("boom"));
    const read = vi.fn().mockResolvedValue(summary(4));
    expect(await countUnsyncedBeforeLogout("u", { isOnline: () => true, sync, summary: read })).toBe(4);
  });

  it("blockiert den Logout nicht, wenn die Warteschlange nicht lesbar ist", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("idb"));
    expect(await countUnsyncedBeforeLogout("u", { isOnline: () => true, sync: fail, summary: fail })).toBe(0);
  });
});
