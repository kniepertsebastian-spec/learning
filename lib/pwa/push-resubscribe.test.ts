import { describe, expect, it, vi } from "vitest";
import { originOf, readPushText, resubscribePush, type ResubscribeDeps, type SubscriptionLike } from "@/lib/pwa/push-resubscribe";

const sub = (endpoint: string, key: ArrayBuffer | null = new Uint8Array([1, 2, 3]).buffer): SubscriptionLike => ({
  endpoint,
  options: { applicationServerKey: key, userVisibleOnly: true },
  toJSON: () => ({ endpoint, keys: { p256dh: "p".repeat(30), auth: "a".repeat(10) } }),
});

const ok = (body: unknown = {}) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const fail = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });

function deps(overrides: Partial<ResubscribeDeps>): ResubscribeDeps & { fetch: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> } {
  return {
    oldSubscription: null,
    newSubscription: null,
    subscribe: vi.fn(() => Promise.resolve(sub("https://push.example/new"))),
    fetch: vi.fn(() => ok()),
    ...overrides,
  } as ResubscribeDeps & { fetch: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
}

const calls = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${url}`);

describe("resubscribePush", () => {
  it("meldet ein mitgeliefertes neues Abo und meldet das alte ab", async () => {
    const d = deps({ oldSubscription: sub("https://push.example/old"), newSubscription: sub("https://push.example/new") });
    expect(await resubscribePush(d)).toBe("renewed");
    expect(d.subscribe).not.toHaveBeenCalled();
    expect(calls(d.fetch)).toEqual(["POST /api/push/subscribe", "DELETE /api/push/subscribe"]);
    expect(JSON.parse((d.fetch.mock.calls[1][1] as RequestInit).body as string)).toEqual({ endpoint: "https://push.example/old" });
  });

  it("fordert mit dem Schlüssel des alten Abos ein neues an", async () => {
    const old = sub("https://push.example/old");
    const d = deps({ oldSubscription: old });
    expect(await resubscribePush(d)).toBe("renewed");
    expect(d.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: old.options!.applicationServerKey });
    expect(calls(d.fetch)).toEqual(["POST /api/push/subscribe", "DELETE /api/push/subscribe"]);
  });

  it("holt den Schlüssel vom Server, wenn das alte Abo keinen mehr nennt", async () => {
    const d = deps({ oldSubscription: sub("https://push.example/old", null) });
    d.fetch.mockImplementation((url: string) => (url === "/api/push/preferences" ? ok({ publicKey: "AQID" }) : ok()));
    expect(await resubscribePush(d)).toBe("renewed");
    const key = d.subscribe.mock.calls[0][0].applicationServerKey as Uint8Array;
    expect([...key]).toEqual([1, 2, 3]);
    expect(calls(d.fetch)).toEqual(["GET /api/push/preferences", "POST /api/push/subscribe", "DELETE /api/push/subscribe"]);
  });

  it("legt ohne früheres Abo nichts von selbst an", async () => {
    const d = deps({});
    expect(await resubscribePush(d)).toBe("no-key");
    expect(d.subscribe).not.toHaveBeenCalled();
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("gibt auf, wenn kein Schlüssel zu bekommen ist (z. B. abgemeldet)", async () => {
    const d = deps({ oldSubscription: sub("https://push.example/old", null), fetch: vi.fn(() => fail()) });
    expect(await resubscribePush(d)).toBe("no-key");
    expect(d.subscribe).not.toHaveBeenCalled();
  });

  it("meldet das alte Abo nicht ab, wenn der Server das neue ablehnt", async () => {
    const d = deps({ oldSubscription: sub("https://push.example/old"), newSubscription: sub("https://push.example/new"), fetch: vi.fn(() => fail()) });
    expect(await resubscribePush(d)).toBe("failed");
    expect(calls(d.fetch)).toEqual(["POST /api/push/subscribe"]);
  });

  it("schickt kein DELETE, wenn der Endpunkt gleich bleibt", async () => {
    const d = deps({ oldSubscription: sub("https://push.example/same"), newSubscription: sub("https://push.example/same") });
    expect(await resubscribePush(d)).toBe("renewed");
    expect(calls(d.fetch)).toEqual(["POST /api/push/subscribe"]);
  });

  it("wirft nie, auch wenn subscribe oder das Netz scheitert", async () => {
    const d = deps({ oldSubscription: sub("https://push.example/old"), subscribe: vi.fn(() => Promise.reject(new Error("denied"))) });
    expect(await resubscribePush(d)).toBe("failed");
    const offline = deps({ newSubscription: sub("https://push.example/new"), fetch: vi.fn(() => Promise.reject(new TypeError("offline"))) });
    expect(await resubscribePush(offline)).toBe("failed");
  });
});

describe("readPushText", () => {
  it("liest Text und fängt Fehler ab", () => {
    expect(readPushText({ text: () => '{"title":"x"}' })).toBe('{"title":"x"}');
    expect(readPushText(null)).toBeNull();
    expect(readPushText(undefined)).toBeNull();
    expect(
      readPushText({
        text: () => {
          throw new TypeError("kaputt");
        },
      }),
    ).toBeNull();
  });
});

describe("originOf", () => {
  it("liefert den Ursprung oder null statt einer Ausnahme", () => {
    expect(originOf("https://learning.example/cert/x?y=1")).toBe("https://learning.example");
    expect(originOf("about:blank")).toBe("null");
    expect(originOf("")).toBeNull();
    expect(originOf("::kaputt::")).toBeNull();
  });
});
