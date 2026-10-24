import { describe, expect, it } from "vitest";
import type { PendingSyncEvent } from "./offline-db";
import { chunkForKeepalive, summarize, transferPendingEvents, type SyncIo } from "./sync-core";
import { userIdFromSyncTag } from "../pwa/sync-tag";

const event = (id: string, status: PendingSyncEvent["status"] = "pending"): PendingSyncEvent => ({
  clientEventId: id,
  userId: "u1",
  type: "section_quiz",
  createdAt: "2026-10-23T10:00:00.000Z",
  payload: {},
  label: "Test",
  status,
  attempts: 0,
  lastError: null,
  syncedAt: null,
});

function fakeIo(initial: PendingSyncEvent[], respond: (body: { userId: string; events: Array<{ clientEventId: string }> }) => { ok: boolean; status: number; json: () => Promise<unknown> } | Error) {
  const store = new Map(initial.map((e) => [e.clientEventId, e]));
  const transferred: string[] = [];
  const posted: unknown[] = [];
  const io: SyncIo = {
    list: async () => [...store.values()],
    save: async (e) => void store.set(e.clientEventId, e),
    remove: async (id) => void store.delete(id),
    post: async (body) => {
      posted.push(body);
      const r = respond(body as never);
      if (r instanceof Error) throw r;
      return r as never;
    },
    onTransferred: (_u, at) => void transferred.push(at),
  };
  return { io, store, transferred, posted };
}
const ok = (results: unknown[]) => ({ ok: true, status: 200, json: async () => ({ results }) });

describe("transferPendingEvents", () => {
  it("überträgt, entfernt angekommene Ereignisse und meldet die Übertragung", async () => {
    const { io, store, transferred, posted } = fakeIo([event("a"), event("b"), event("c", "conflict")], () => ok([{ clientEventId: "a", status: "applied" }, { clientEventId: "b", status: "conflict", error: "schon abgeschlossen" }]));
    const { summary, networkFailed } = await transferPendingEvents("u1", io, () => null);
    expect(posted).toHaveLength(1);
    expect((posted[0] as { userId: string; events: unknown[] }).events).toHaveLength(2); // Konflikt wird nicht erneut gesendet
    expect([...store.keys()].sort()).toEqual(["b", "c"]);
    expect(store.get("b")).toMatchObject({ status: "conflict", lastError: "schon abgeschlossen" });
    expect(transferred).toHaveLength(1);
    expect(networkFailed).toBe(false);
    expect(summary).toMatchObject({ pendingCount: 0, conflictCount: 2, authRequired: false });
  });

  it("bei 401 bleibt alles unverändert und die Anmeldung wird verlangt", async () => {
    const { io, store, transferred } = fakeIo([event("a")], () => ({ ok: false, status: 401, json: async () => ({}) }));
    const { summary, networkFailed } = await transferPendingEvents("u1", io, () => null);
    expect(store.get("a")).toMatchObject({ status: "pending", attempts: 0 });
    expect(summary).toMatchObject({ authRequired: true, pendingCount: 1 });
    expect(networkFailed).toBe(false);
    expect(transferred).toHaveLength(0);
  });

  it("bei 403 (andere Person angemeldet) ebenfalls", async () => {
    const { io, store } = fakeIo([event("a")], () => ({ ok: false, status: 403, json: async () => ({}) }));
    const { summary } = await transferPendingEvents("u1", io, () => null);
    expect(store.get("a")?.attempts).toBe(0);
    expect(summary.authRequired).toBe(true);
  });

  it("ohne Netz: Fehlversuch gezählt, der Service Worker lässt den Auftrag wiederholen", async () => {
    const { io, store } = fakeIo([event("a")], () => new Error("offline"));
    const { summary, networkFailed } = await transferPendingEvents("u1", io, () => null);
    expect(networkFailed).toBe(true);
    expect(store.get("a")).toMatchObject({ status: "failed", attempts: 1 });
    expect(summary.failedCount).toBe(1);
  });

  it("leere Warteschlange: keine Anfrage", async () => {
    const { io, posted } = fakeIo([], () => new Error("darf nicht aufgerufen werden"));
    const { networkFailed } = await transferPendingEvents("u1", io, () => null);
    expect(posted).toHaveLength(0);
    expect(networkFailed).toBe(false);
  });
});

describe("userIdFromSyncTag", () => {
  it("liest die Nutzer-ID aus dem Auftragsnamen", () => {
    expect(userIdFromSyncTag("sync-queue:abc")).toBe("abc");
    expect(userIdFromSyncTag("sync-queue:")).toBeNull();
    expect(userIdFromSyncTag("anderes")).toBeNull();
  });
});

describe("chunkForKeepalive", () => {
  const big = (id: string, bytes: number): PendingSyncEvent => ({ ...event(id), payload: { filler: "x".repeat(bytes) } });
  it("packt kleine Ereignisse in eine Anfrage", () => {
    const { chunks, skipped } = chunkForKeepalive([event("a"), event("b")], "u1");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].map((e) => e.clientEventId)).toEqual(["a", "b"]);
    expect(skipped).toEqual([]);
  });
  it("teilt auf mehrere Anfragen unter der Grenze", () => {
    const { chunks } = chunkForKeepalive([big("a", 400), big("b", 400), big("c", 400)], "u1", 1000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(new TextEncoder().encode(JSON.stringify({ userId: "u1", events: c })).length).toBeLessThanOrEqual(1000);
    expect(chunks.flat().map((e) => e.clientEventId)).toEqual(["a", "b", "c"]);
  });
  it("lässt ein zu großes Ereignis für die normale Übertragung liegen", () => {
    const { chunks, skipped } = chunkForKeepalive([event("a"), big("huge", 5000)], "u1", 1000);
    expect(chunks.flat().map((e) => e.clientEventId)).toEqual(["a"]);
    expect(skipped.map((e) => e.clientEventId)).toEqual(["huge"]);
  });
});

describe("summarize", () => {
  it("nennt das Alter des ältesten unübertragenen Ereignisses", () => {
    const old = { ...event("old"), createdAt: "2026-10-20T10:00:00.000Z" };
    const failed = { ...event("f", "failed"), createdAt: "2026-10-21T10:00:00.000Z" };
    const conflict = { ...event("c", "conflict"), createdAt: "2026-10-01T10:00:00.000Z" };
    expect(summarize([failed, old, conflict], null).oldestUnsyncedAt).toBe("2026-10-20T10:00:00.000Z");
    expect(summarize([conflict], null).oldestUnsyncedAt).toBeNull();
  });
});
