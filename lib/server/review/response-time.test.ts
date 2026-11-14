/** Aufgabe 06b: Grenzen der Antwortzeit und Annahme im Body-Schema. */
import { describe, expect, it } from "vitest";
import { sectionAttemptBody, studySessionAttemptBody } from "@/lib/server/http/attempt-body";
import { parseExamAttemptInput } from "@/lib/server/exam/attempt";
import { MAX_RESPONSE_TIME_MS, MIN_RESPONSE_TIME_MS, plausibleResponseTimeMs, rawResponseTimeMs } from "./response-time";

describe("plausibleResponseTimeMs", () => {
  it("lässt Werte von 300 ms bis 10 Minuten roh durch", () => {
    expect(plausibleResponseTimeMs(MIN_RESPONSE_TIME_MS)).toBe(300);
    expect(plausibleResponseTimeMs(4321)).toBe(4321);
    expect(plausibleResponseTimeMs(MAX_RESPONSE_TIME_MS)).toBe(600_000);
    expect(plausibleResponseTimeMs(1234.6)).toBe(1235);
  });

  it("setzt zu kurze, zu lange und unbrauchbare Werte auf null", () => {
    expect(plausibleResponseTimeMs(299)).toBeNull();
    expect(plausibleResponseTimeMs(0)).toBeNull();
    expect(plausibleResponseTimeMs(-5)).toBeNull();
    expect(plausibleResponseTimeMs(MAX_RESPONSE_TIME_MS + 1)).toBeNull();
    for (const value of [undefined, null, "4000", Number.NaN, Number.POSITIVE_INFINITY, {}]) expect(plausibleResponseTimeMs(value)).toBeNull();
  });
});

describe("rawResponseTimeMs", () => {
  it("behält jeden nicht negativen Wert (Zwischenstand), verwirft Unbrauchbares", () => {
    expect(rawResponseTimeMs(120)).toBe(120);
    expect(rawResponseTimeMs(2_000_000)).toBe(2_000_000);
    expect(rawResponseTimeMs(-1)).toBeUndefined();
    expect(rawResponseTimeMs("5")).toBeUndefined();
  });
});

describe("Antwortzeit im Body", () => {
  it("wird angenommen, fehlt bei älteren Clients und kostet als unbrauchbarer Wert nicht die Antwort", () => {
    const parsed = studySessionAttemptBody.parse({
      answers: [
        { itemId: "a", selectedOptionId: "o", responseTimeMs: 4200 },
        { itemId: "b", selectedOptionId: "o" },
        { itemId: "c", selectedOptionId: "o", responseTimeMs: "schnell" },
        { itemId: "d", selectedOptionId: "o", responseTimeMs: -3 },
      ],
    });
    expect(parsed.answers.map((a) => a.responseTimeMs)).toEqual([4200, undefined, undefined, undefined]);
    expect(sectionAttemptBody.parse({ answers: [{ questionId: "q", selectedOptionId: "o", responseTimeMs: 900 }] }).answers[0].responseTimeMs).toBe(900);
  });

  it("Prüfung: Zeit je Antwort, ohne Zeit bleibt die Abgabe gültig", () => {
    expect(parseExamAttemptInput({ answers: [{ questionId: "q", selectedOptionId: "o", responseTimeMs: 1500 }, { questionId: "r", responseTimeMs: "x" }] })).toEqual({
      answers: [{ questionId: "q", selectedOptionId: "o", responseTimeMs: 1500 }, { questionId: "r", selectedOptionId: "" }],
      durationSeconds: undefined,
    });
  });
});
