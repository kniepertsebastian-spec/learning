import { describe, expect, it } from "vitest";
import { accessFromStatus, pruneRevokedPackages, type PackageAccess } from "./revoked-packages";

function fakeDeps(access: Record<string, PackageAccess>) {
  const stored = new Set(Object.keys(access));
  return {
    stored,
    deps: {
      list: async () => [...stored].map((id) => ({ certificationId: id, certName: `Kurs ${id}` })),
      check: async (id: string) => access[id],
      remove: async (id: string) => void stored.delete(id),
    },
  };
}

describe("pruneRevokedPackages", () => {
  it("löscht nur Pakete mit verweigertem Zugriff", async () => {
    const { deps, stored } = fakeDeps({ a: "granted", b: "revoked", c: "revoked" });
    const removed = await pruneRevokedPackages(deps);
    expect(removed.map((p) => p.certificationId)).toEqual(["b", "c"]);
    expect([...stored]).toEqual(["a"]);
  });
  it("löscht bei Netzfehler, fehlender Anmeldung oder Serverfehler nichts", async () => {
    const { deps, stored } = fakeDeps({ a: "unknown", b: "unknown" });
    expect(await pruneRevokedPackages(deps)).toEqual([]);
    expect(stored.size).toBe(2);
  });
});

describe("accessFromStatus", () => {
  it("ordnet HTTP-Status zu", () => {
    expect(accessFromStatus(200)).toBe("granted");
    expect(accessFromStatus(404)).toBe("revoked");
    expect(accessFromStatus(403)).toBe("revoked");
    expect(accessFromStatus(401)).toBe("unknown");
    expect(accessFromStatus(500)).toBe("unknown");
    expect(accessFromStatus(502)).toBe("unknown");
  });
});
