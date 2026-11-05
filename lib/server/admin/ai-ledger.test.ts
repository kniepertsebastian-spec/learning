import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Array<Record<string, unknown>> = [];
let failInsert = false;

vi.mock("@/lib/server/db/client", () => ({
  getDb: () => ({
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        if (failInsert) throw new Error("DATABASE_URL ist nicht gesetzt");
        inserted.push(row);
      },
    }),
  }),
}));

import { recordAiUsage, withAiCost, withAiCostDefaults } from "./ai-ledger";

const USAGE = { model: "gemini-3.8-flash", promptTokens: 1_000_000, completionTokens: 1_000_000 };

beforeEach(() => {
  inserted.length = 0;
  failInsert = false;
});

describe("recordAiUsage", () => {
  it("schreibt Token und die aus dem Preis geschätzten Kosten", async () => {
    await recordAiUsage({ ...USAGE, cachedTokens: 1_000_000 });
    expect(inserted).toHaveLength(1);
    // 0,075 (Eingabe aus dem Cache) + 3,75 (Ausgabe)
    expect(Number(inserted[0].costUsd)).toBeCloseTo(3.825, 6);
    expect(inserted[0]).toMatchObject({ model: "gemini-3.8-flash", promptTokens: 1_000_000, completionTokens: 1_000_000, cachedTokens: 1_000_000, byok: false });
  });

  it("ohne Kontext: Quelle „other“, kein Kurs (der Aufruf geht nicht verloren)", async () => {
    await recordAiUsage(USAGE);
    expect(inserted[0]).toMatchObject({ source: "other", detail: null, certificationId: null, generationJobId: null });
  });

  it("übernimmt Kurs, Quelle und Auftrag aus dem Kontext, auch über await-Grenzen und parallele Aufrufe", async () => {
    await Promise.all([
      withAiCost({ source: "translation", certificationId: "cert-1" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await recordAiUsage(USAGE);
      }),
      withAiCost({ source: "course_generation", generationJobId: "job-1" }, async () => {
        await recordAiUsage(USAGE);
      }),
    ]);
    const bySource = Object.fromEntries(inserted.map((row) => [row.source as string, row]));
    expect(bySource.translation).toMatchObject({ certificationId: "cert-1", generationJobId: null });
    expect(bySource.course_generation).toMatchObject({ certificationId: null, generationJobId: "job-1" });
  });

  it("der Kontext endet mit dem Aufruf von withAiCost", async () => {
    await withAiCost({ source: "workshop", certificationId: "cert-1" }, async () => undefined);
    await recordAiUsage(USAGE);
    expect(inserted[0]).toMatchObject({ source: "other", certificationId: null });
  });

  it("markiert Aufrufe mit dem Schlüssel einer Firma", async () => {
    await recordAiUsage(USAGE, { byok: true });
    expect(inserted[0].byok).toBe(true);
  });

  it("Modell ohne Preis: Kosten NULL statt einer erfundenen Zahl", async () => {
    await recordAiUsage({ model: "ein-unbekanntes-modell", promptTokens: 10, completionTokens: 10 });
    expect(inserted[0].costUsd).toBeNull();
  });

  it("wirft nie, wenn das Verbuchen scheitert (der KI-Aufruf hat Geld gekostet und sein Ergebnis wird gebraucht)", async () => {
    failInsert = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(recordAiUsage(USAGE)).resolves.toBeUndefined();
    await expect(recordAiUsage(USAGE)).resolves.toBeUndefined();
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1); // nur einmal gemeldet
    warn.mockRestore();
  });
});

describe("withAiCostDefaults", () => {
  it("ohne äußeren Kontext gelten die Vorgaben", async () => {
    await withAiCostDefaults({ source: "workshop", certificationId: "cert-1" }, () => recordAiUsage(USAGE));
    expect(inserted[0]).toMatchObject({ source: "workshop", certificationId: "cert-1" });
  });

  it("ein äußerer Kontext gewinnt (ein Sammellauf bleibt ein Sammellauf), fehlende Angaben kommen aus den Vorgaben", async () => {
    await withAiCost({ source: "batch", detail: "quality" }, () => withAiCostDefaults({ source: "workshop", certificationId: "cert-1" }, () => recordAiUsage(USAGE)));
    expect(inserted[0]).toMatchObject({ source: "batch", detail: "quality", certificationId: "cert-1" });
  });

  it("ein äußerer Kurs wird nicht überschrieben", async () => {
    await withAiCost({ source: "batch", detail: "formats", certificationId: "cert-outer" }, () => withAiCostDefaults({ source: "workshop", certificationId: "cert-inner" }, () => recordAiUsage(USAGE)));
    expect(inserted[0]).toMatchObject({ certificationId: "cert-outer" });
  });
});
