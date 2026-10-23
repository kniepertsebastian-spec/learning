import { describe, expect, it } from "vitest";
import { distinctVariantFailureSignal, evaluateStruggle, repeatedWrongOptionSignals, type RawSignal } from "@/lib/server/understanding/rules";

const now = new Date("2026-10-23T10:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const sig = (kind: RawSignal["kind"], d: number): RawSignal => ({ kind, at: daysAgo(d) });

describe("evaluateStruggle", () => {
  it("löst bei einem Einzelfehler nicht aus", () => {
    expect(evaluateStruggle([sig("sure_wrong", 1)], now).triggered).toBe(false);
    expect(evaluateStruggle([], now).triggered).toBe(false);
  });
  it("löst bei 2 verschiedenen Signalarten aus", () => {
    expect(evaluateStruggle([sig("sure_wrong", 1), sig("distinct_variant_failures", 2)], now).triggered).toBe(true);
  });
  it("löst bei 2× falsch + sicher aus", () => {
    expect(evaluateStruggle([sig("sure_wrong", 1), sig("sure_wrong", 5)], now).triggered).toBe(true);
  });
  it("zählt dieselbe Signalart (außer falsch + sicher) nicht doppelt", () => {
    expect(evaluateStruggle([sig("stalled_item", 1), sig("stalled_item", 2)], now).triggered).toBe(false);
  });
  it("ignoriert Signale außerhalb des 14-Tage-Fensters", () => {
    expect(evaluateStruggle([sig("sure_wrong", 1), sig("distinct_variant_failures", 20)], now).triggered).toBe(false);
    expect(evaluateStruggle([sig("sure_wrong", 14), sig("stalled_item", 14)], now).triggered).toBe(true);
  });
  it("zählt nach einer Lösung nur neuere Signale", () => {
    const signals = [sig("sure_wrong", 6), sig("distinct_variant_failures", 5)];
    expect(evaluateStruggle(signals, now, undefined, daysAgo(3)).triggered).toBe(false);
    expect(evaluateStruggle([...signals, sig("sure_wrong", 1), sig("stalled_item", 2)], now, undefined, daysAgo(3)).triggered).toBe(true);
  });
  it("liefert die gezählten Signale mit Frage und Option", () => {
    const e = evaluateStruggle([{ kind: "repeated_wrong_option", at: daysAgo(1), questionId: "q", optionId: "o" }, sig("sure_wrong", 2)], now);
    expect(e.signals.map((s) => s.kind)).toEqual(["sure_wrong", "repeated_wrong_option"]);
    expect(e.signals[1]).toMatchObject({ questionId: "q", optionId: "o" });
  });
});

describe("repeatedWrongOptionSignals", () => {
  it("meldet dieselbe falsche Option bei derselben Frage ab 2 Mal, nicht verschiedene Optionen", () => {
    const wrong = [
      { questionId: "q1", optionId: "a", at: daysAgo(3) },
      { questionId: "q1", optionId: "a", at: daysAgo(1) },
      { questionId: "q1", optionId: "b", at: daysAgo(2) },
      { questionId: "q2", optionId: "a", at: daysAgo(2) },
    ];
    const s = repeatedWrongOptionSignals(wrong, 2);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ questionId: "q1", optionId: "a" });
    expect(s[0].at).toEqual(daysAgo(1));
  });
});

describe("distinctVariantFailureSignal", () => {
  it("braucht Fehler bei 2 verschiedenen Fragen", () => {
    expect(distinctVariantFailureSignal([{ questionId: "q1", at: daysAgo(2) }, { questionId: "q1", at: daysAgo(1) }], 2)).toBeNull();
    expect(distinctVariantFailureSignal([{ questionId: "q1", at: daysAgo(2) }, { questionId: "v1", at: daysAgo(1) }], 2)?.at).toEqual(daysAgo(1));
  });
});
