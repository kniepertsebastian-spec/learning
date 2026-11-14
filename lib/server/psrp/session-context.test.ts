import { describe, expect, it } from "vitest";
import {
  afterFailureStreak,
  computeSessionContext,
  computeSessionContextByGroup,
  countWords,
  isSkimmed,
  wordsPerMinute,
  type ReadingRecord,
  type SessionContextUser,
} from "./session-context";

const reading = (over: Partial<ReadingRecord> = {}): ReadingRecord => ({ seconds: 300, opens: 1, words: 1000, firstQuizScore: null, ...over });
const person = (over: Partial<SessionContextUser> = {}): SessionContextUser => ({ group: "planning", reading: [], sessions: [], deviceSessions: [], ...over });

describe("4.9 Lesetiefe", () => {
  it("zählt Wörter ohne Codeblöcke und ohne reine Satzzeichen", () => {
    expect(countWords("# Titel\n\nEin Satz mit fünf Wörtern.\n\n```sh\nls -la /etc\n```\n\n- Punkt – Strich")).toBe(8);
    expect(countWords("")).toBe(0);
  });

  it("Lesetempo in Wörtern pro Minute; null ohne Zeit oder Text", () => {
    expect(wordsPerMinute({ seconds: 300, words: 1000 })).toBeCloseTo(200, 6);
    expect(wordsPerMinute({ seconds: 0, words: 1000 })).toBeNull();
    expect(wordsPerMinute({ seconds: 60, words: 0 })).toBeNull();
  });

  it("kaum gelesen: über 600 Wörter pro Minute oder ohne Lesezeit geöffnet", () => {
    expect(isSkimmed({ seconds: 300, words: 1000 })).toBe(false); // 200 wpm
    expect(isSkimmed({ seconds: 60, words: 600 })).toBe(false); // genau 600 wpm
    expect(isSkimmed({ seconds: 60, words: 700 })).toBe(true);
    expect(isSkimmed({ seconds: 0, words: 1000 })).toBe(true);
    expect(isSkimmed({ seconds: 0, words: 0 })).toBe(false); // Lektion ohne Text
  });

  it("Lesezeit gegen Testergebnis: Mittel je Seite mit Nenner und Unterschied", () => {
    const m = computeSessionContext([
      person({
        reading: [
          reading({ firstQuizScore: 90 }),
          reading({ firstQuizScore: 70 }),
          reading({ seconds: 20, firstQuizScore: 40 }),
          reading({ seconds: 0, opens: 2, firstQuizScore: 60 }),
          reading({ seconds: 20, firstQuizScore: null }),
        ],
      }),
    ]).reading;
    expect(m.lessons).toBe(5);
    expect(m.skimmed).toMatchObject({ numerator: 3, n: 5, small: true });
    expect(m.reopened).toMatchObject({ numerator: 1, n: 5 });
    expect(m.firstQuizScore.read).toMatchObject({ n: 2, meanScore: 80 });
    expect(m.firstQuizScore.skimmed).toMatchObject({ n: 2, meanScore: 50 });
    expect(m.firstQuizScore.difference).toBe(30);
  });

  it("ohne Daten gibt es keine Anteile statt einer Null", () => {
    const m = computeSessionContext([person()]).reading;
    expect(m.skimmed).toMatchObject({ n: 0, share: null });
    expect(m.firstQuizScore.difference).toBeNull();
    expect(m.medianWordsPerMinute).toBeNull();
  });
});

describe("4.10 Durchhalten nach Fehlern", () => {
  it("nach der dritten falschen Antwort in Folge: weiter, Ausstieg oder Ende", () => {
    expect(afterFailureStreak({ ratings: [3, 1, 1, 1, 3], exited: false })).toBe("continued");
    expect(afterFailureStreak({ ratings: [3, 1, 1, 1], exited: true })).toBe("exited");
    expect(afterFailureStreak({ ratings: [3, 1, 1, 1], exited: false })).toBe("ended");
  });

  it("ohne drei Fehler in Folge gibt es keine Serie", () => {
    expect(afterFailureStreak({ ratings: [1, 1, 3, 1, 1], exited: false })).toBeNull();
    expect(afterFailureStreak({ ratings: [], exited: true })).toBeNull();
  });

  it("nur die erste Serie einer Sitzung zählt", () => {
    expect(afterFailureStreak({ ratings: [1, 1, 1, 3, 1, 1, 1], exited: true })).toBe("continued");
  });

  it("vier Fehler in Folge sind eine Serie, keine zwei", () => {
    const m = computeSessionContext([person({ sessions: [{ ratings: [1, 1, 1, 1], exited: false }] })]).persistence;
    expect(m.sessionsWithStreak).toBe(1);
  });

  it("Anteile mit Nenner", () => {
    const m = computeSessionContext([
      person({
        sessions: [
          { ratings: [1, 1, 1, 4], exited: false },
          { ratings: [1, 1, 1], exited: true },
          { ratings: [1, 1, 1], exited: false },
          { ratings: [4, 4], exited: false },
        ],
      }),
    ]).persistence;
    expect(m).toMatchObject({ sessionsWithStreak: 3, continued: { numerator: 1, n: 3 }, exited: { numerator: 1, n: 3 }, ended: { numerator: 1, n: 3, small: true } });
  });
});

describe("4.12 Gerät", () => {
  it("getrennt nach schmal und breit, Sitzungen ohne Angabe gesondert", () => {
    const m = computeSessionContext([
      person({
        deviceSessions: [
          { deviceClass: "narrow", answered: 10, correct: 6 },
          { deviceClass: "narrow", answered: 10, correct: 8 },
          { deviceClass: "wide", answered: 20, correct: 18 },
          { deviceClass: null, answered: 5, correct: 5 },
        ],
      }),
    ]).device;
    expect(m.narrow).toMatchObject({ sessions: 2, answered: 20, correct: 14, accuracy: 0.7, small: true });
    expect(m.wide).toMatchObject({ sessions: 1, accuracy: 0.9 });
    expect(m.unknown).toBe(1);
  });
});

describe("Gruppen", () => {
  it("gesamt und je Gruppe", () => {
    const m = computeSessionContextByGroup([
      person({ group: "vanilla", deviceSessions: [{ deviceClass: "wide", answered: 1, correct: 1 }] }),
      person({ group: "planning", deviceSessions: [{ deviceClass: "narrow", answered: 1, correct: 0 }] }),
    ]);
    expect(m.all.device.wide.sessions + m.all.device.narrow.sessions).toBe(2);
    expect(m.byGroup.vanilla?.device.wide.sessions).toBe(1);
    expect(m.byGroup.planning?.device.narrow.sessions).toBe(1);
  });
});
