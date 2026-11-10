/** Der Rate-Limit-Speicher bleibt begrenzt: abgelaufene Einträge verschwinden, die Zahl der Schlüssel hat eine Obergrenze. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkRateLimit, MAX_KEY_LENGTH, MAX_TRACKED_KEYS, trackedRateLimitKeys } from "./rate-limit";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Eine einzige Uhr für die ganze Datei: der Speicher ist prozessweit und merkt sich den letzten Sweep, die Zeit darf nur vorwärts laufen.
beforeAll(() => {
  vi.useFakeTimers({ now: Date.now() });
});
afterAll(() => {
  vi.useRealTimers();
});

/** Lässt alle bisherigen Einträge ablaufen (längstes Fenster hier: eine Stunde) und räumt sie per Sweep weg. */
function drain() {
  vi.advanceTimersByTime(2 * HOUR);
  checkRateLimit("drain", "x", MINUTE, 1);
}

describe("Speicher des Rate-Limiters", () => {
  it("löscht abgelaufene Einträge beim nächsten Aufruf nach dem Sweep-Intervall", () => {
    for (let i = 0; i < 100; i++) checkRateLimit("sweep-a", `k${i}`, MINUTE, 1);
    expect(trackedRateLimitKeys()).toBeGreaterThanOrEqual(100);
    const before = trackedRateLimitKeys();

    vi.advanceTimersByTime(MINUTE + 1000);
    checkRateLimit("sweep-a", "neu", MINUTE, 1);
    // Die 100 abgelaufenen sind weg, übrig bleibt nur der neue Eintrag (plus alles, was noch nicht abgelaufen war).
    expect(trackedRateLimitKeys()).toBeLessThanOrEqual(before - 100 + 1);
  });

  it("behält Einträge, deren Fenster noch läuft, und zählt weiter", () => {
    expect(checkRateLimit("sweep-b", "lang", HOUR, 2).allowed).toBe(true);
    expect(checkRateLimit("sweep-b", "kurz", MINUTE, 2).allowed).toBe(true);

    vi.advanceTimersByTime(5 * MINUTE);
    checkRateLimit("sweep-b", "anstoss", MINUTE, 1); // löst den Sweep aus

    expect(checkRateLimit("sweep-b", "lang", HOUR, 2).allowed).toBe(true);
    expect(checkRateLimit("sweep-b", "lang", HOUR, 2).allowed).toBe(false);
    // Der abgelaufene Schlüssel beginnt von vorn.
    expect(checkRateLimit("sweep-b", "kurz", MINUTE, 2).allowed).toBe(true);
  });

  it("gibt nach Ablauf des Fensters wieder frei und nennt vorher die Wartezeit", () => {
    expect(checkRateLimit("fenster", "u", MINUTE, 1).allowed).toBe(true);
    const blocked = checkRateLimit("fenster", "u", MINUTE, 1);
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 60 });
    vi.advanceTimersByTime(MINUTE);
    expect(checkRateLimit("fenster", "u", MINUTE, 1).allowed).toBe(true);
  });

  it("verfolgt höchstens MAX_TRACKED_KEYS Schlüssel, auch wenn noch nichts abgelaufen ist", () => {
    for (let i = 0; i < MAX_TRACKED_KEYS + 500; i++) checkRateLimit("flut", `k${i}`, HOUR, 1);
    expect(trackedRateLimitKeys()).toBe(MAX_TRACKED_KEYS);
  });

  it("verdrängt zuerst den am längsten unberührten Schlüssel, nicht den aktiven", () => {
    // Der aktive Schlüssel wird zwischendurch immer wieder benutzt und bleibt deshalb erhalten.
    const results: boolean[] = [];
    for (let i = 0; i < MAX_TRACKED_KEYS + 2000; i++) {
      checkRateLimit("flut2", `k${i}`, HOUR, 1);
      if (i % 5000 === 0 && results.length < 3) results.push(checkRateLimit("flut2", "aktiv", HOUR, 3).allowed);
    }
    expect(results).toEqual([true, true, true]);
    expect(checkRateLimit("flut2", "aktiv", HOUR, 3).allowed).toBe(false);
  });

  it("kürzt sehr lange Schlüssel, statt sie vollständig zu speichern", () => {
    drain();
    const before = trackedRateLimitKeys();
    const huge = "x".repeat(1_000_000);
    expect(checkRateLimit("lang", huge, HOUR, 1).allowed).toBe(true);
    expect(checkRateLimit("lang", huge, HOUR, 1).allowed).toBe(false);
    expect(trackedRateLimitKeys()).toBe(before + 1);
    expect(MAX_KEY_LENGTH).toBeLessThan(1000);
  });
});
