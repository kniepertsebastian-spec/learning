import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const savePendingSyncEvent = vi.fn();
vi.mock("@/lib/client/offline-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./offline-db")>()),
  savePendingSyncEvent: (...args: unknown[]) => savePendingSyncEvent(...args),
}));

const { enqueueSyncEvent, getUnsavedSyncEventCount, onSyncQueueError, retryUnsavedSyncEvents, SyncQueueError } = await import("./sync-queue");

const quotaError = () => new DOMException("The quota has been exceeded.", "QuotaExceededError");

beforeEach(() => {
  savePendingSyncEvent.mockReset();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", { onLine: false });
});

afterEach(async () => {
  // Seitenspeicher der Warteschlange zwischen den Tests leeren.
  savePendingSyncEvent.mockResolvedValue(undefined);
  await retryUnsavedSyncEvents();
  vi.unstubAllGlobals();
});

describe("enqueueSyncEvent: Speichermangel", () => {
  it("wirft einen typisierten SyncQueueError und meldet ihn der Oberfläche, statt das Ergebnis still zu verlieren", async () => {
    savePendingSyncEvent.mockRejectedValue(quotaError());
    const details: unknown[] = [];
    const unsubscribe = onSyncQueueError((detail) => details.push(detail));

    const error = await enqueueSyncEvent("u1", "section_quiz", { sectionId: "s1", answers: [] }, "Abschnitts-Quiz").catch((e: unknown) => e);
    unsubscribe();

    expect(error).toBeInstanceOf(SyncQueueError);
    expect((error as InstanceType<typeof SyncQueueError>).code).toBe("QUOTA_EXCEEDED");
    expect(details).toEqual([{ code: "QUOTA_EXCEEDED", label: "Abschnitts-Quiz", unsavedCount: 1 }]);
    expect(getUnsavedSyncEventCount()).toBe(1);
  });

  it("sichert das gehaltene Ergebnis nach, sobald wieder Platz ist", async () => {
    savePendingSyncEvent.mockRejectedValueOnce(quotaError());
    await enqueueSyncEvent("u1", "section_quiz", { sectionId: "s1", answers: [] }, "Quiz").catch(() => {});
    expect(getUnsavedSyncEventCount()).toBe(1);

    savePendingSyncEvent.mockResolvedValue(undefined);
    expect(await retryUnsavedSyncEvents()).toBe(0);
    expect(savePendingSyncEvent).toHaveBeenCalledTimes(2);
    expect(savePendingSyncEvent.mock.calls[1][0]).toEqual(savePendingSyncEvent.mock.calls[0][0]);
  });

  it("sendet online direkt an den Server, wenn die Warteschlange voll ist", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    savePendingSyncEvent.mockRejectedValue(quotaError());
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { events: { clientEventId: string }[] };
      return new Response(JSON.stringify({ results: [{ clientEventId: body.events[0].clientEventId, status: "applied" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(enqueueSyncEvent("u1", "section_quiz", { sectionId: "s1", answers: [] }, "Quiz")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/sync", expect.objectContaining({ method: "POST" }));
    expect(getUnsavedSyncEventCount()).toBe(0);
  });

  it("reicht andere Fehler unverändert weiter", async () => {
    const other = new Error("IndexedDB kaputt");
    savePendingSyncEvent.mockRejectedValue(other);
    await expect(enqueueSyncEvent("u1", "section_quiz", {}, "Quiz")).rejects.toBe(other);
    expect(getUnsavedSyncEventCount()).toBe(0);
  });
});
