/** Wirkungsbericht gegen eine ECHTE Postgres-Datenbank: läuft mit beliebigen Daten durch und liefert die erwartete Form (Rechenregeln: lib/psrp/impact-report.test.ts). */
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getImpactReport } from "./impact";

const run = TEST_DB ? describe : describe.skip;

run("Wirkungsbericht (echte DB)", () => {
  it("liefert alle vier Teile mit gültigen Zahlen, auch bei wenig Daten", async () => {
    const report = await getImpactReport(new Date());
    expect(report.calibration.byLastScore).toHaveLength(5);
    expect(report.recall.byDelay.map((b) => b.key)).toEqual(["lt24h", "24to72h", "gte72h"]);
    for (const band of [...report.recall.byDelay, ...report.recall.byPhiAtLearning, ...report.recall.byHourAtLearning]) {
      expect(band.actual.n).toBeGreaterThanOrEqual(0);
      if (band.actual.rate !== null) {
        expect(band.actual.rate).toBeGreaterThanOrEqual(0);
        expect(band.actual.rate).toBeLessThanOrEqual(1);
      }
    }
    expect(report.understanding.total).toBe(Object.values(report.understanding.counts).reduce((a, b) => a + b, 0));
    for (const flag of report.flags) expect(flag.flag).toMatch(/^[a-z_]+$/);
    expect(report.flags.some((f) => f.flag === "understanding_mode")).toBe(true);
  });
});
