import { describe, expect, it } from "vitest";
import { CHAPTER_PASS_PERCENT, CHAPTER_QUIZ_SIZE, chapterQuizPassed, chapterState, drawChapterQuestions, shuffled } from "./logic";

/** Einfacher, reproduzierbarer Zufallsgenerator (LCG). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const pool = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `q${i}` }));

describe("Kapitel-Quiz: Ziehung", () => {
  it("zieht 10 verschiedene Fragen aus einem Pool von 30", () => {
    const drawn = drawChapterQuestions(pool(30), { rng: seeded(1) });
    expect(drawn).toHaveLength(CHAPTER_QUIZ_SIZE);
    expect(new Set(drawn.map((q) => q.id)).size).toBe(CHAPTER_QUIZ_SIZE);
  });
  it("kleiner Pool: alle Fragen, keine doppelt", () => {
    expect(drawChapterQuestions(pool(6), { rng: seeded(2) })).toHaveLength(6);
    expect(drawChapterQuestions([{ id: "a" }, { id: "a" }, { id: "b" }], { rng: seeded(3) })).toHaveLength(2);
  });
  it("verschiedene Aufrufe ergeben verschiedene Zusammenstellungen", () => {
    const first = drawChapterQuestions(pool(30), { rng: seeded(4) }).map((q) => q.id).join();
    const second = drawChapterQuestions(pool(30), { rng: seeded(5) }).map((q) => q.id).join();
    expect(first).not.toBe(second);
  });
  it("meidet zuletzt gestellte Fragen, solange der Rest reicht", () => {
    const last = drawChapterQuestions(pool(30), { rng: seeded(6) });
    const avoid = new Set(last.map((q) => q.id));
    for (let seed = 10; seed < 30; seed++) {
      const next = drawChapterQuestions(pool(30), { avoid, rng: seeded(seed) });
      expect(next.some((q) => avoid.has(q.id))).toBe(false);
    }
  });
  it("füllt mit schon gestellten Fragen auf, wenn zu wenige neue übrig sind", () => {
    const avoid = new Set(pool(30).slice(0, 25).map((q) => q.id));
    const next = drawChapterQuestions(pool(30), { avoid, rng: seeded(7) });
    expect(next).toHaveLength(CHAPTER_QUIZ_SIZE);
    expect(next.filter((q) => !avoid.has(q.id))).toHaveLength(5);
  });
  it("Mischen verändert die Eingabe nicht und verliert nichts", () => {
    const input = pool(8);
    const out = shuffled(input, seeded(8));
    expect(input.map((q) => q.id)).toEqual(pool(8).map((q) => q.id));
    expect([...out].sort((a, b) => a.id.localeCompare(b.id))).toEqual(input);
  });
});

describe("Kapitel: Abschluss", () => {
  it("bestanden ab der Schwelle", () => {
    expect(chapterQuizPassed(CHAPTER_PASS_PERCENT)).toBe(true);
    expect(chapterQuizPassed(CHAPTER_PASS_PERCENT - 1)).toBe(false);
    expect(chapterQuizPassed(null)).toBe(false);
  });
  it("Lektionen und Quiz müssen beide erledigt sein", () => {
    const base = { sectionTotal: 3, poolSize: 30, quizEnabled: true };
    expect(chapterState({ ...base, sectionsDone: 2, bestScore: 90 }).completed).toBe(false);
    expect(chapterState({ ...base, sectionsDone: 3, bestScore: null }).completed).toBe(false);
    expect(chapterState({ ...base, sectionsDone: 3, bestScore: 60 }).completed).toBe(false);
    expect(chapterState({ ...base, sectionsDone: 3, bestScore: 80 }).completed).toBe(true);
  });
  it("ohne Quiz (Kurs ohne Tests oder leerer Pool) genügen die Lektionen", () => {
    expect(chapterState({ sectionTotal: 2, sectionsDone: 2, poolSize: 0, bestScore: null, quizEnabled: true }).completed).toBe(true);
    expect(chapterState({ sectionTotal: 2, sectionsDone: 2, poolSize: 30, bestScore: null, quizEnabled: false }).completed).toBe(true);
  });
  it("ein Kapitel ohne Lektionen gilt nicht als abgeschlossen", () => {
    expect(chapterState({ sectionTotal: 0, sectionsDone: 0, poolSize: 30, bestScore: 100, quizEnabled: true }).completed).toBe(false);
  });
});

describe("Kapitel: Fragenpool beim Erzeugen und im Bericht", () => {
  it("verteilt fehlende Fragen gleichmäßig auf die Lernziele", async () => {
    const { distributeMissingQuestions } = await import("./logic");
    expect(distributeMissingQuestions(10, 4)).toEqual([3, 3, 2, 2]);
    expect(distributeMissingQuestions(0, 4)).toEqual([]);
    expect(distributeMissingQuestions(50, 2)).toEqual([10, 10]); // Obergrenze je Lernziel; der Rest folgt im nächsten Lauf
  });
  it("hebt die empfohlene Fragenzahl auf einen Pool von 30 an", async () => {
    const { raiseQuestionTargets } = await import("./logic");
    const out = raiseQuestionTargets([4, 4, 4, 4, 4]);
    expect(out.reduce((s, c) => s + c, 0)).toBe(30);
    expect(Math.max(...out) - Math.min(...out)).toBeLessThanOrEqual(1);
    expect(raiseQuestionTargets([8, 8, 8, 8])).toEqual([8, 8, 8, 8]); // 32 reichen schon
    expect(raiseQuestionTargets([4, 4])).toEqual([10, 10]); // mehr als 10 je Lernziel gibt es nicht
  });
});

describe("Kapitel: Freischaltung von Merkzettel und Simulationen", () => {
  const chapters = [
    { domainId: "k3", orderNum: 3, completed: false },
    { domainId: "k1", orderNum: 1, completed: false },
    { domainId: "k2", orderNum: 2, completed: false },
  ];
  it("Merkzettel startet mit dem ersten Kapitel und wächst mit jedem abgeschlossenen", async () => {
    const { unlockedForCheatSheets } = await import("./logic");
    expect([...unlockedForCheatSheets(chapters)]).toEqual(["k1"]);
    expect([...unlockedForCheatSheets(chapters.map((c) => (c.domainId === "k2" ? { ...c, completed: true } : c)))].sort()).toEqual(["k1", "k2"]);
    expect(unlockedForCheatSheets([]).size).toBe(0);
  });
  it("Simulationen: nur aus abgeschlossenen Kapiteln, am Anfang keine", async () => {
    const { unlockedForSimulations } = await import("./logic");
    expect(unlockedForSimulations(chapters).size).toBe(0);
    expect([...unlockedForSimulations(chapters.map((c) => (c.domainId === "k1" ? { ...c, completed: true } : c)))]).toEqual(["k1"]);
  });
});
