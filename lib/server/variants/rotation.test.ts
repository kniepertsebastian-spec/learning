import { describe, expect, it } from "vitest";
import { pickVariant, variantRotationEnabled } from "@/lib/server/variants/rotation";

const now = new Date("2026-10-22T10:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("pickVariant", () => {
  it("rotiert nicht mit nur einer Variante", () => {
    expect(pickVariant([{ questionId: "o", lastShownAt: null }], now)).toBeNull();
  });
  it("bevorzugt eine noch nie gezeigte Variante vor dem Original", () => {
    expect(pickVariant([{ questionId: "o", lastShownAt: daysAgo(1) }, { questionId: "v1", lastShownAt: null }], now)).toBe("v1");
  });
  it("nimmt die am längsten nicht gezeigte, wenn alle schon gezeigt wurden", () => {
    expect(pickVariant([{ questionId: "o", lastShownAt: daysAgo(3) }, { questionId: "v1", lastShownAt: daysAgo(10) }, { questionId: "v2", lastShownAt: daysAgo(5) }], now)).toBe("v1");
  });
  it("zeigt nie zweimal hintereinander dieselbe Frage (vier Wiederholungen, zwei Varianten)", () => {
    const shown: string[] = [];
    const last = new Map<string, Date>();
    let t = now;
    for (let i = 0; i < 4; i++) {
      const pick = pickVariant(["o", "v1"].map((q) => ({ questionId: q, lastShownAt: last.get(q) ?? null })), t)!;
      shown.push(pick);
      last.set(pick, t);
      t = new Date(t.getTime() + 2 * 86_400_000);
    }
    for (let i = 1; i < shown.length; i++) expect(shown[i]).not.toBe(shown[i - 1]);
  });
  it("ist bei Gleichstand stabil (Original zuerst)", () => {
    expect(pickVariant([{ questionId: "o", lastShownAt: null }, { questionId: "v1", lastShownAt: null }], now)).toBe("o");
  });
});

describe("variantRotationEnabled", () => {
  it("ist standardmäßig an und hart abschaltbar", () => {
    expect(variantRotationEnabled("u", {})).toBe(true);
    expect(variantRotationEnabled("u", { VARIANT_ROTATION: "0" })).toBe(false);
  });
  it("teilt Nutzer stabil nach Anteil zu", () => {
    expect(variantRotationEnabled("u", { VARIANT_ROTATION_ROLLOUT: "0" })).toBe(false);
    const ids = Array.from({ length: 400 }, (_, i) => `user-${i}`);
    const on = ids.filter((id) => variantRotationEnabled(id, { VARIANT_ROTATION_ROLLOUT: "50" }));
    expect(on.length).toBeGreaterThan(140);
    expect(on.length).toBeLessThan(260);
    expect(ids.filter((id) => variantRotationEnabled(id, { VARIANT_ROTATION_ROLLOUT: "50" }))).toEqual(on);
  });
});
