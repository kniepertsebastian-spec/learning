import { describe, expect, it } from "vitest";
import { ResponseTimer } from "./response-timer";

/** Testuhr: `advance` stellt sie vor. */
function clock() {
  let t = 1000;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("ResponseTimer", () => {
  it("misst die Zeit von der Anzeige bis zur Antwort", () => {
    const c = clock();
    const timer = new ResponseTimer(c.now);
    timer.show(0);
    c.advance(4200);
    expect(timer.answer()).toBe(4200);
    expect(timer.get(0)).toBe(4200);
  });

  it("ein Tab-Wechsel während der Frage erhöht die Zeit nicht", () => {
    const c = clock();
    const timer = new ResponseTimer(c.now);
    timer.show(0);
    c.advance(2000);
    timer.setHidden(true);
    c.advance(5 * 60_000);
    timer.setHidden(false);
    c.advance(1500);
    expect(timer.answer()).toBe(3500);
  });

  it("mehrere Wechsel in den Hintergrund zählen nicht mit", () => {
    const c = clock();
    const timer = new ResponseTimer(c.now);
    timer.show("a");
    for (let i = 0; i < 3; i++) {
      c.advance(1000);
      timer.setHidden(true);
      c.advance(60_000);
      timer.setHidden(false);
    }
    expect(timer.answer()).toBe(3000);
  });

  it("eine Frage, die im Hintergrund angezeigt wird, startet erst mit der Rückkehr", () => {
    const c = clock();
    const timer = new ResponseTimer(c.now);
    timer.show(0);
    c.advance(1000);
    timer.setHidden(true);
    timer.show(1);
    c.advance(30_000);
    timer.setHidden(false);
    c.advance(2000);
    expect(timer.answer()).toBe(2000);
    expect(timer.get(0)).toBeUndefined();
  });

  it("beginnt die Seite im Hintergrund, zählt die Zeit bis zur Rückkehr nicht", () => {
    const c = clock();
    const timer = new ResponseTimer(c.now, true);
    timer.show(0);
    c.advance(10_000);
    timer.setHidden(false);
    c.advance(700);
    expect(timer.answer()).toBe(700);
  });

  it("jede Frage hat ihre eigene Zeit, Zurückblättern addiert", () => {
    const c = clock();
    const timer = new ResponseTimer(c.now);
    timer.show(0);
    c.advance(3000);
    timer.show(1);
    c.advance(1000);
    expect(timer.answer()).toBe(1000);
    timer.show(0);
    c.advance(2000);
    expect(timer.answer()).toBe(5000);
    expect(timer.get(1)).toBe(1000);
  });

  it("wird die Antwort geändert, gilt die Zeit bis zur letzten Antwort", () => {
    const c = clock();
    const timer = new ResponseTimer(c.now);
    timer.show(0);
    c.advance(2000);
    expect(timer.answer()).toBe(2000);
    c.advance(3000);
    expect(timer.answer()).toBe(5000);
    expect(timer.get(0)).toBe(5000);
  });

  it("nach der Antwort läuft die Uhr der Frage weiter, falls sie neu beantwortet wird, ohne im Hintergrund zu zählen", () => {
    const c = clock();
    const timer = new ResponseTimer(c.now);
    timer.show(0);
    c.advance(1000);
    timer.answer();
    timer.setHidden(true);
    c.advance(60_000);
    timer.setHidden(false);
    c.advance(500);
    expect(timer.answer()).toBe(1500);
  });

  it("ohne angezeigte Frage gibt es keine Zeit", () => {
    expect(new ResponseTimer(clock().now).answer()).toBeUndefined();
  });

  it("stellt eine gespeicherte Zeit wieder her und ignoriert ungültige Werte", () => {
    const timer = new ResponseTimer(clock().now);
    timer.restore(2, 4321.4);
    timer.restore(3, -5);
    timer.restore(4, Number.NaN);
    expect(timer.get(2)).toBe(4321);
    expect(timer.get(3)).toBeUndefined();
    expect(timer.get(4)).toBeUndefined();
  });

  it("gibt ganze Millisekunden zurück", () => {
    const c = clock();
    const timer = new ResponseTimer(c.now);
    timer.show(0);
    c.advance(1234.56);
    expect(Number.isInteger(timer.answer())).toBe(true);
  });
});
