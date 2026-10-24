import { describe, expect, it } from "vitest";
import { compareFigures, flagConfig, formatFigure, keyFigures, type BaselineSource } from "./baseline";
import type { EngagementMetrics } from "./engagement-metrics";

const rate = (numerator: number, denominator: number) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });
const engagement = (churn7: [number, number], users = 10): EngagementMetrics => ({
  users,
  churn7: rate(...churn7),
  churn30: rate(0, 0),
  returnAfterPause: { ...rate(1, 4), closed: 1, open: 3 },
  courseCompletion: rate(2, 5),
  exit: { ...rate(1, 10), perHundredSessions: 2 },
  deescalation: rate(0, 10),
});
const arm = (retention: number | null, reviews: number) => ({ users: 3, reviews, retention });

const source = (churn: [number, number]): BaselineSource => ({
  asOf: "2026-10-24T00:00:00.000Z",
  engagement: { all: engagement(churn), byFlag: { exit_with_win: { enabled: engagement(churn), disabled: engagement([0, 0], 0) } } },
  retentionByFlag: { recall_check: { enabled: arm(0.8, 100), disabled: arm(null, 0) } },
});

describe("Kennzahlen", () => {
  it("flache Liste mit stabilen Schlüsseln, Werten und Nennern", () => {
    const f = keyFigures(source([4, 8]));
    expect(f["engagement.all.churn7"]).toEqual({ value: 0.5, n: 8 });
    expect(f["engagement.all.returnAfterPause"]).toEqual({ value: 0.25, n: 4 });
    expect(f["flag.exit_with_win.enabled.churn7"]).toEqual({ value: 0.5, n: 8 });
    expect(f["flag.exit_with_win.disabled.churn7"]).toEqual({ value: null, n: 0 });
    expect(f["retention.recall_check.enabled"]).toEqual({ value: 0.8, n: 100 });
    expect(f["retention.recall_check.disabled"]).toEqual({ value: null, n: 0 });
  });
});

describe("Vergleich", () => {
  it("zeigt die Veränderung und markiert kleine Stichproben", () => {
    const rows = compareFigures(keyFigures(source([4, 8])), keyFigures(source([2, 8])));
    const churn = rows.find((r) => r.key === "engagement.all.churn7")!;
    expect(churn.delta).toBeCloseTo(-0.25);
    expect(churn.small).toBe(true); // n = 8 < 20
    expect(rows.find((r) => r.key === "retention.recall_check.enabled")!.small).toBe(false);
  });
  it("fehlende Seite oder fehlender Wert ergibt kein Delta", () => {
    const rows = compareFigures({ a: { value: 0.1, n: 50 } }, { b: { value: 0.2, n: 50 }, a: { value: null, n: 0 } });
    expect(rows.map((r) => [r.key, r.delta])).toEqual([["a", null], ["b", null]]);
  });
  it("Ausgabe: Prozent, Anzahl, Strich ohne Wert", () => {
    expect(formatFigure("engagement.all.churn7", { value: 0.5, n: 8 })).toBe("50.0 % (n=8)");
    expect(formatFigure("engagement.all.users", { value: 12, n: null })).toBe("12");
    expect(formatFigure("x", { value: null, n: 0 })).toBe("–");
    expect(formatFigure("x", null)).toBe("–");
  });
});

describe("Flag-Anteile", () => {
  it("liest Anteil und harten Aus-Schalter aus der Umgebung", () => {
    const cfg = flagConfig({ FEATURE_EXIT_WITH_WIN_ROLLOUT: "50", FEATURE_REACTIVATION: "0", FEATURE_ENERGY_MODES_ROLLOUT: "abc" });
    expect(cfg.exit_with_win).toBe(50);
    expect(cfg.reactivation).toBe(0);
    expect(cfg.energy_modes).toBe(100);
    expect(cfg.dropout_guard).toBe(100);
  });
});
