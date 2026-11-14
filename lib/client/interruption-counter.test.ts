/** Aufgabe 12: Zählen der Wechsel in den Hintergrund und Prüfen der Werte auf dem Server. */
import { describe, expect, it } from "vitest";
import { MAX_INTERRUPTIONS, parseInterruptions } from "@/lib/interruptions";
import { InterruptionCounter } from "./interruption-counter";

describe("InterruptionCounter", () => {
  it("zählt Wechsel ab 2 Sekunden beim Zurückkommen, kürzere nicht", () => {
    let t = 0;
    const c = new InterruptionCounter(() => t);
    c.setHidden(true);
    t = 1500;
    c.setHidden(false); // zu kurz
    t = 10_000;
    c.setHidden(true);
    t = 40_000;
    expect(c.snapshot()).toEqual({ count: 0, totalMs: 0 }); // läuft noch
    c.setHidden(false);
    c.setHidden(false); // doppeltes Ereignis
    t = 50_000;
    c.setHidden(true);
    c.setHidden(true);
    t = 52_000;
    c.setHidden(false);
    expect(c.snapshot()).toEqual({ count: 2, totalMs: 32_000 });
  });

  it("setzt nach einer Pause fort und zählt einen Start im Hintergrund", () => {
    let t = 0;
    const c = new InterruptionCounter(() => t, true);
    c.restore({ count: 3, totalMs: 9000 });
    t = 5000;
    c.setHidden(false);
    expect(c.snapshot()).toEqual({ count: 4, totalMs: 14_000 });
    c.restore(undefined);
    expect(c.snapshot().count).toBe(4);
  });
});

describe("parseInterruptions", () => {
  it("nimmt plausible Werte, verwirft Unbrauchbares", () => {
    expect(parseInterruptions({ count: 0, totalMs: 0 })).toEqual({ count: 0, totalMs: 0 });
    expect(parseInterruptions({ count: 2, totalMs: 4000.4 })).toEqual({ count: 2, totalMs: 4000 });
    for (const raw of [null, "3", { count: 1 }, { count: 1.5, totalMs: 3000 }, { count: -1, totalMs: 0 }, { count: 0, totalMs: 10 }, { count: 2, totalMs: 3000 }, { count: MAX_INTERRUPTIONS + 1, totalMs: 1e7 }, { count: 1, totalMs: 1e9 }, { count: "2", totalMs: 5000 }]) {
      expect(parseInterruptions(raw)).toBeNull();
    }
  });
});
