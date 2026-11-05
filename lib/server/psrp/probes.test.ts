import { describe, expect, it } from "vitest";
import { buildTaggingPlan, itemPrompt, MAX_VARIANTS_PER_CONCEPT, similarity, validateVariant, type TaggingInput, type TaggingResponse } from "./concepts";
import { chooseProbes, interleaveProbes, probeBudget, type ProbeCandidate } from "./probes";

const NOW = new Date("2026-05-10T12:00:00Z");
const DAY = 86_400_000;
const cand = (id: string, extra: Partial<ProbeCandidate> = {}): ProbeCandidate => ({
  variantId: id, questionId: `q-${id}`, conceptId: `c-${id}`, topicArea: "Netz", isBottleneck: true, predictedR: 0.85,
  easyCount: 0, probeCount: 0, variantLastUsed: null, lastRegularReview: null, topicOverestimated: false, ...extra,
});

describe("Abfrage-Scheduler", () => {
  it("Budget: höchstens 10 % der Aufgaben", () => {
    expect([5, 9, 10, 25, 40].map((n) => probeBudget(n))).toEqual([0, 0, 1, 2, 4]);
  });

  it("nur Bottleneck-Varianten mit R zwischen 0.80 und 0.90", () => {
    const list = [cand("a"), cand("b", { predictedR: 0.7 }), cand("c", { predictedR: 0.95 }), cand("d", { isBottleneck: false }), cand("e", { predictedR: null })];
    expect(chooseProbes(list, 50, NOW).map((c) => c.variantId)).toEqual(["a"]);
  });

  it("Variante frühestens nach 30 Tagen erneut; kein regulärer Review des Konzepts in den letzten 24 h", () => {
    const list = [
      cand("recent", { variantLastUsed: new Date(NOW.getTime() - 10 * DAY) }),
      cand("old", { variantLastUsed: new Date(NOW.getTime() - 31 * DAY) }),
      cand("fresh", { lastRegularReview: new Date(NOW.getTime() - 3_600_000) }),
      cand("ok", { lastRegularReview: new Date(NOW.getTime() - 30 * 3_600_000) }),
    ];
    expect(chooseProbes(list, 100, NOW).map((c) => c.variantId).sort()).toEqual(["ok", "old"]);
  });

  it("Priorität: viele Easy, wenige Abfragen, Überschätzung zuerst; je Konzept eine Variante", () => {
    const list = [
      cand("low"), cand("easy", { easyCount: 2 }), cand("over", { topicOverestimated: true }),
      cand("probed", { easyCount: 5, probeCount: 8 }),
      cand("dup", { conceptId: "c-easy", easyCount: 1 }),
    ];
    const chosen = chooseProbes(list, 40, NOW).map((c) => c.variantId); // Budget 4
    expect(chosen[0]).toBe("over");
    expect(chosen).toContain("easy");
    expect(chosen).not.toContain("dup");
  });

  it("nie zwei Abfragen direkt hintereinander, keine an erster Stelle", () => {
    const tasks = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const out = interleaveProbes(tasks, ["P1", "P2"]);
    expect(out).toHaveLength(22);
    const idx = out.map((x, i) => (x.startsWith("P") ? i : -1)).filter((i) => i >= 0);
    expect(idx[0]).toBeGreaterThan(0);
    expect(idx[1] - idx[0]).toBeGreaterThan(1);
    expect(interleaveProbes(["a"], ["P"])).toEqual(["a"]);
  });
});

describe("Variantenvalidierung", () => {
  const original = {
    question: { de: "Welche Schicht des OSI-Modells ist für Routing zuständig?", en: "Which OSI layer is responsible for routing?" },
    explanation: { de: "Routing erfolgt auf Schicht 3, der Vermittlungsschicht, anhand von IP-Adressen.", en: "Routing happens on layer 3, the network layer, based on IP addresses." },
    correctOption: { de: "Schicht 3 (Vermittlungsschicht)", en: "Layer 3 (network layer)" },
  };
  const options = (text: string) => [
    { text: { de: text, en: text }, isCorrect: true },
    ...["A", "B", "C"].map((x) => ({ text: { de: `Antwort ${x}`, en: `Answer ${x}` }, isCorrect: false })),
  ];
  const good = {
    question: { de: "Ein Paket soll zwischen zwei Firmennetzen weitergeleitet werden. Auf welcher Ebene entscheidet das Gerät?", en: "A packet must be forwarded between two company networks. At which level does the device decide?" },
    options: options("Auf der Netzwerkebene"),
    explanation: { de: "x", en: "x" },
  };

  it("akzeptiert eine Variante mit anderer Oberfläche", () => {
    expect(validateVariant(good, original).ok).toBe(true);
  });
  it("lehnt zu ähnliche Oberfläche ab", () => {
    const same = { ...good, question: original.question };
    expect(validateVariant(same, original)).toMatchObject({ ok: false });
  });
  it("lehnt wörtlichen Lösungsweg ab", () => {
    const leak = { ...good, question: { de: `${good.question.de} Hinweis: Routing erfolgt auf Schicht 3, der Vermittlungsschicht, anhand von IP-Adressen.`, en: good.question.en } };
    expect(validateVariant(leak, original)).toMatchObject({ ok: false, reason: expect.stringContaining("Lösungsweg") });
  });
  it("verlangt genau eine richtige Option", () => {
    const bad = { ...good, options: good.options.map((o) => ({ ...o, isCorrect: true })) };
    expect(validateVariant(bad, original).ok).toBe(false);
  });
  it("Ähnlichkeit ist symmetrisch und 1 für gleiche Texte", () => {
    expect(similarity("alpha beta gamma delta", "alpha beta gamma delta")).toBe(1);
    expect(similarity("alpha beta gamma", "delta epsilon zeta")).toBe(0);
  });
});

describe("Tagging-Plan", () => {
  const input: TaggingInput = {
    objectiveTitle: "Netzwerke", topicArea: "Netzwerke", requiredConcepts: [],
    items: [
      { id: "i1", humanId: "H1", question: { de: "Frage eins zum Routing im Netz", en: "Question one routing" }, explanation: { de: "Erklärung", en: "Explanation" }, correctOption: { de: "Router", en: "Router" } },
    ],
  };
  const variant = (concept: string, text: string): TaggingResponse["variants"][number] => ({
    concept, sourceItem: 1, format: "transfer", isBottleneck: true,
    question: { de: text, en: text }, explanation: { de: "e", en: "e" },
    options: [{ text: { de: "R", en: "R" }, isCorrect: true }, ...[1, 2, 3].map((n) => ({ text: { de: `F${n}`, en: `F${n}` }, isCorrect: false }))],
  });
  it("behält nur Konzepte mit mindestens zwei gültigen Varianten", () => {
    const plan = buildTaggingPlan(input, {
      concepts: [{ name: "Routing", items: [1] }, { name: "Switching", items: [1] }],
      variants: [
        variant("Routing", "Völlig anderes Szenario mit Servern und Kabeln"),
        variant("Routing", "Noch ein anderes Szenario in einer Firma"),
        variant("Switching", "Einzelne Variante ohne Partner im Betrieb"),
        variant("Unbekannt", "Konzept existiert nicht in der Liste"),
      ],
    });
    expect(plan.variants.map((v) => v.conceptName)).toEqual(["Routing", "Routing"]);
    expect(plan.rejected).toHaveLength(1);
  });

  it(`behält je Konzept höchstens ${MAX_VARIANTS_PER_CONCEPT} Varianten (die ersten), andere Konzepte bleiben unberührt`, () => {
    const texts = ["Szenario mit Servern und Kabeln", "Szenario in einer Firma mit Filialen", "Szenario im Rechenzentrum nachts", "Szenario bei einem Provider vor Ort", "Szenario in der Cloud mit Regionen"];
    const plan = buildTaggingPlan(input, {
      concepts: [{ name: "Routing", items: [1] }, { name: "Switching", items: [1] }],
      variants: [
        ...texts.map((t) => variant("Routing", t)),
        variant("Switching", "Erster Fall mit Ports und VLANs im Büro"),
        variant("Switching", "Zweiter Fall mit Trunks zwischen Etagen"),
      ],
    });
    const routing = plan.variants.filter((v) => v.conceptName === "Routing");
    expect(routing).toHaveLength(MAX_VARIANTS_PER_CONCEPT);
    expect(routing.map((v) => v.question.de)).toEqual(texts.slice(0, MAX_VARIANTS_PER_CONCEPT));
    expect(plan.variants.filter((v) => v.conceptName === "Switching")).toHaveLength(2);
  });
});

describe("Item-Text für die Anfrage", () => {
  const item = { id: "i1", humanId: "H1", explanation: { de: "Weil Router Netze verbinden.", en: "Because routers connect networks." }, correctOption: { de: "Router", en: "Router" } };

  it("schickt eine Frage, die in beiden Sprachen gleich ist, nur einmal", () => {
    const text = itemPrompt({ ...item, question: { de: "Was verbindet Netze?", en: "Was verbindet Netze?" } }, 0);
    expect(text).toBe("Item 1\nFrage: Was verbindet Netze?\nRichtige Antwort: Router\nErklärung: Weil Router Netze verbinden.");
    expect(text).not.toContain("Englisch");
  });

  it("schickt beide Sprachen, wenn sie sich unterscheiden", () => {
    const text = itemPrompt({ ...item, question: { de: "Was verbindet Netze?", en: "What connects networks?" } }, 2);
    expect(text).toContain("Item 3\nFrage (Deutsch): Was verbindet Netze?\nFrage (Englisch): What connects networks?");
  });
});
