import { describe, expect, it } from "vitest";
import { contentHash, countChanges, diffFingerprints, nextVersionLabel, type CourseFingerprints } from "./diff";

const base: CourseFingerprints = { sections: { s1: "a", s2: "b" }, questions: { q1: "c", q2: "d" } };

describe("contentHash", () => {
  it("derselbe Inhalt ergibt immer denselben Hash, auch in anderer Reihenfolge", () => {
    const shuffled: CourseFingerprints = { sections: { s2: "b", s1: "a" }, questions: { q2: "d", q1: "c" } };
    expect(contentHash(base)).toBe(contentHash(shuffled));
    expect(contentHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("jede Änderung, Ergänzung oder Entfernung ändert den Hash", () => {
    const h = contentHash(base);
    expect(contentHash({ ...base, questions: { ...base.questions, q1: "x" } })).not.toBe(h);
    expect(contentHash({ ...base, questions: { ...base.questions, q3: "e" } })).not.toBe(h);
    expect(contentHash({ ...base, sections: { s1: "a" } })).not.toBe(h);
  });
  it("Abschnitt und Frage mit gleicher ID-Zeichenfolge werden nicht verwechselt", () => {
    expect(contentHash({ sections: { x: "1" }, questions: {} })).not.toBe(contentHash({ sections: {}, questions: { x: "1" } }));
  });
});

describe("diffFingerprints", () => {
  it("ohne Änderung keine Unterschiede", () => {
    expect(countChanges(diffFingerprints(base, base))).toBe(0);
  });
  it("erkennt geänderte, neue und entfernte Abschnitte und Fragen", () => {
    const current: CourseFingerprints = { sections: { s1: "a2", s3: "n" }, questions: { q1: "c", q2: "d", q9: "v" } };
    const diff = diffFingerprints(base, current);
    expect(diff.sections).toEqual({ added: ["s3"], removed: ["s2"], changed: ["s1"] });
    expect(diff.questions).toEqual({ added: ["q9"], removed: [], changed: [] }); // neue Variante zählt als Änderung
    expect(countChanges(diff)).toBe(4);
  });
});

describe("nextVersionLabel", () => {
  it("Freigabe zählt hoch, redaktionelle Änderung die Nebennummer", () => {
    expect(nextVersionLabel(null, "approval")).toBe("1.0");
    expect(nextVersionLabel("1.0", "approval")).toBe("2.0");
    expect(nextVersionLabel("2.0", "editorial")).toBe("2.1");
    expect(nextVersionLabel("2.1", "editorial")).toBe("2.2");
    expect(nextVersionLabel("2.2", "approval")).toBe("3.0");
  });
});
