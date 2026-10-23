/** Die Einschätzung zum Prüfungstermin gehört nur der lernenden Person: der Firmenbereich darf Fortschritts-Stände nie lesen. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

describe("Fortschrittsansicht und Firmenbereich", () => {
  it("kein Firmen-Code importiert Fortschritts-Stände oder Prognose", () => {
    const offenders = ["lib/server/company", "app/api/company", "app/company"]
      .flatMap((d) => { try { return files(d); } catch { return []; } })
      .filter((f) => !f.endsWith(".test.ts") && /progress\/(snapshots|forecast)|objectiveSnapshots/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
