import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveOfflinePackage = vi.fn();
vi.mock("@/lib/client/offline-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./offline-db")>()),
  saveOfflinePackage: (...args: unknown[]) => saveOfflinePackage(...args),
}));
vi.mock("@/lib/client/storage-status", () => ({ requestPersistentStorage: vi.fn(async () => null) }));

const { downloadOfflinePackage, hasStorageRoomFor, OfflineDownloadError, requiredStorageBytes } = await import("./offline-download");

const PKG = JSON.stringify({ certificationId: "c1", certSlug: "c1", certName: "Kurs", version: "v1", domains: [] });

function packageResponse(body = PKG, contentLength: string | null = String(body.length)): Response {
  const headers = new Headers();
  if (contentLength !== null) headers.set("Content-Length", contentLength);
  return new Response(body, { status: 200, headers });
}

function stubStorage(estimate: { usage?: number; quota?: number } | null) {
  vi.stubGlobal("navigator", estimate ? { storage: { estimate: async () => estimate } } : {});
}

beforeEach(() => {
  saveOfflinePackage.mockReset();
  saveOfflinePackage.mockImplementation(async (userId: string, pkg: { version: string }, sizeBytes: number) => ({ userId, version: pkg.version, sizeBytes }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hasStorageRoomFor", () => {
  it("rechnet Paketgröße plus Reserve gegen den freien Speicher", async () => {
    const needed = requiredStorageBytes(10_000);
    stubStorage({ usage: 0, quota: needed });
    expect(await hasStorageRoomFor(10_000)).toBe(true);
    stubStorage({ usage: 1, quota: needed });
    expect(await hasStorageRoomFor(10_000)).toBe(false);
  });

  it("lässt den Schreibversuch entscheiden, wenn es keine Schätzung gibt", async () => {
    stubStorage(null);
    expect(await hasStorageRoomFor(10_000_000)).toBe(true);
    stubStorage({});
    expect(await hasStorageRoomFor(10_000_000)).toBe(true);
  });
});

describe("downloadOfflinePackage: Speichermangel", () => {
  it("bricht vorab mit QUOTA_EXCEEDED ab, wenn Content-Length nicht mehr passt", async () => {
    stubStorage({ usage: 99_000_000, quota: 100_000_000 });
    const fetchMock = vi.fn(async () => packageResponse(PKG, String(50_000_000)));
    vi.stubGlobal("fetch", fetchMock);

    const error = await downloadOfflinePackage("c1", "u1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OfflineDownloadError);
    expect((error as InstanceType<typeof OfflineDownloadError>).code).toBe("QUOTA_EXCEEDED");
    expect(saveOfflinePackage).not.toHaveBeenCalled();
  });

  it("meldet einen echten QuotaExceededError beim Schreiben als QUOTA_EXCEEDED", async () => {
    stubStorage(null);
    vi.stubGlobal("fetch", vi.fn(async () => packageResponse()));
    saveOfflinePackage.mockRejectedValueOnce(new DOMException("The quota has been exceeded.", "QuotaExceededError"));

    const error = await downloadOfflinePackage("c1", "u1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OfflineDownloadError);
    expect((error as InstanceType<typeof OfflineDownloadError>).code).toBe("QUOTA_EXCEEDED");
  });

  it("andere Fehler bleiben DOWNLOAD_FAILED", async () => {
    stubStorage(null);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));

    const error = await downloadOfflinePackage("c1", "u1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OfflineDownloadError);
    expect((error as InstanceType<typeof OfflineDownloadError>).code).toBe("DOWNLOAD_FAILED");
  });

  it("speichert, wenn genug Platz ist", async () => {
    stubStorage({ usage: 0, quota: 100_000_000 });
    vi.stubGlobal("fetch", vi.fn(async () => packageResponse()));

    const stored = await downloadOfflinePackage("c1", "u1");
    expect(stored.version).toBe("v1");
    expect(saveOfflinePackage).toHaveBeenCalledWith("u1", expect.objectContaining({ version: "v1" }), PKG.length);
  });
});
