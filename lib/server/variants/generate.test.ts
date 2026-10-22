import { describe, expect, it } from "vitest";
import { estimateRun, missingVariantCount, validateGeneratedVariant, type GeneratedVariant, type VariantSource } from "@/lib/server/variants/generate";

const source: VariantSource = {
  id: "q1", humanId: "H-1", objectiveId: "o", topicId: null, difficulty: "easy", type: "single", sourceReference: null,
  question: { de: "Welches Protokoll löst Hostnamen in IP-Adressen auf?", en: "Which protocol resolves hostnames to IP addresses?" },
  explanation: { de: "DNS übersetzt Namen in Adressen.", en: "DNS translates names into addresses." },
  correctOption: { de: "DNS", en: "DNS" },
  options: [{ de: "DNS", en: "DNS" }, { de: "DHCP", en: "DHCP" }, { de: "ARP", en: "ARP" }, { de: "NTP", en: "NTP" }],
  existingVariants: [],
};
const variant = (q: string): GeneratedVariant => ({
  question: { de: q, en: q },
  options: [{ text: { de: "A", en: "A" }, isCorrect: true }, { text: { de: "B", en: "B" }, isCorrect: false }, { text: { de: "C", en: "C" }, isCorrect: false }, { text: { de: "D", en: "D" }, isCorrect: false }],
  explanation: { de: "Weil.", en: "Because." },
});

describe("missingVariantCount", () => {
  it("füllt auf das Ziel auf", () => {
    expect(missingVariantCount(0)).toBe(2);
    expect(missingVariantCount(1)).toBe(1);
    expect(missingVariantCount(5)).toBe(0);
  });
});

describe("validateGeneratedVariant", () => {
  it("akzeptiert eine eigenständige Variante", () => {
    expect(validateGeneratedVariant(variant("Ein Admin tippt www.beispiel.de ein und bekommt keine Seite. Welcher Dienst fehlt?"), source, []).ok).toBe(true);
  });
  it("lehnt eine fast wortgleiche Frage ab", () => {
    expect(validateGeneratedVariant(variant(source.question.de), source, []).ok).toBe(false);
  });
  it("lehnt Varianten ab, die einer Geschwister-Variante zu ähnlich sind", () => {
    const q = "Ein Admin tippt www.beispiel.de ein und bekommt keine Seite. Welcher Dienst fehlt?";
    expect(validateGeneratedVariant(variant(q), source, [{ question: { de: q, en: q } }]).ok).toBe(false);
  });
  it("lehnt Varianten ohne genau eine richtige Option ab", () => {
    const v = variant("Völlig andere Frage über Namensauflösung im Firmennetz mit Szenario");
    v.options[1].isCorrect = true;
    expect(validateGeneratedVariant(v, source, []).ok).toBe(false);
  });
});

describe("estimateRun", () => {
  it("zählt nur Fragen mit fehlenden Varianten", () => {
    const full = { ...source, id: "q2", existingVariants: [{ question: source.question }, { question: source.question }] };
    const e = estimateRun([source, full]);
    expect(e).toMatchObject({ items: 1, variants: 2 });
    expect(e.completionTokens).toBeGreaterThan(0);
  });
});
