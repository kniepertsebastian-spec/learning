import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("@/lib/client/offline-db", () => ({
  clearOfflineDataForUser: async (id: string) => void calls.push(`packages:${id}`),
  clearPendingSyncEventsForUser: async (id: string) => void calls.push(`queue:${id}`),
}));
vi.mock("@/lib/client/sync-queue", () => ({ clearSyncMetadata: (id: string) => void calls.push(`meta:${id}`) }));
vi.mock("@/lib/client/cache-owner", () => ({ clearPagesCache: async () => void calls.push("pages") }));
vi.mock("@/lib/client/last-user", () => ({ clearLastUserId: () => void calls.push("last-user") }));

const { clearLocalUserData } = await import("./clear-local-data");

beforeEach(() => {
  calls.length = 0;
});

describe("clearLocalUserData", () => {
  it("Abmelden/Passwortwechsel: Kurspakete und Seiten-Cache weg, Sync-Warteschlange bleibt", async () => {
    await clearLocalUserData("u1");
    expect(calls).toEqual(["packages:u1", "pages", "last-user"]);
  });

  it("Kontolöschung: zusätzlich Warteschlange und Sync-Merker der Person", async () => {
    await clearLocalUserData("u1", { includeSyncQueue: true });
    expect(calls).toEqual(["packages:u1", "queue:u1", "meta:u1", "pages", "last-user"]);
  });
});
