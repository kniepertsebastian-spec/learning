/**
 * Token-Sparmaßnahmen der Kursgenerierung (ohne Datenbank, ohne KI): einsprachige KI-Antwort, Reparaturen ohne KI,
 * Teil-Reparatur nur fehlender Fragen, Zerlegen von Text-/HTML-Quellen, Cache-Preis in der Kostenschätzung.
 */
import { describe, expect, it } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { estimateCostUsd } from "@/lib/server/admin/content-generation";
import { createHaikuContentProvider, createSonnetRepairProvider } from "./providers";
import {
  objectiveContentAiResponseSchema,
  objectiveContentResponseSchema,
  toBilingualObjectiveContent,
  toMonoObjectiveContent,
  type CourseBlueprintObjective,
  type ObjectiveContentResponse,
} from "./schemas";
import { splitIntoSections, stripHtml } from "./sources";
import { autoFixObjectiveContent, missingQuestionsOnly, validateObjectiveContent } from "./validation";

const objective: CourseBlueprintObjective = {
  id: "o", code: "1.1", title: "VLANs", description: "VLANs verstehen", examWeight: 1, complexity: "medium",
  requiredConcepts: ["vlan"], commonMisconceptions: [], lessonPlan: ["Grundlagen"], sourceLocators: ["Abschnitt 1"],
  recommendedQuestions: 3, requiredScenarios: [],
};

const monoQuestion = (text: string, locator: string | null = "Abschnitt 1") => ({
  difficulty: "beginner", type: "knowledge", question: text,
  options: [
    { text: "A", isCorrect: true }, { text: "B", isCorrect: false }, { text: "C", isCorrect: false }, { text: "D", isCorrect: false },
  ],
  explanation: "Ein VLAN trennt Broadcast-Domänen.", sourceLocator: locator,
});
const monoSection = { title: "VLAN", estimatedMinutes: 10, difficulty: "beginner", content: "Ein VLAN trennt Broadcast-Domänen.", keyTakeaways: ["a", "b"], examFocusPoints: ["a", "b"], cheatSheet: "- `show vlan`" };

function content(questions: ReturnType<typeof monoQuestion>[]): ObjectiveContentResponse {
  return toBilingualObjectiveContent(objectiveContentAiResponseSchema.parse({ sections: [monoSection], questions }));
}

describe("einsprachige KI-Antwort", () => {
  it("wird in beide Sprachfelder gelegt und erfüllt das bestehende Paketformat", () => {
    const result = content([monoQuestion("Was trennt ein VLAN?")]);
    expect(objectiveContentResponseSchema.safeParse(result).success).toBe(true);
    expect(result.sections[0].title).toEqual({ de: "VLAN", en: "VLAN" });
    expect(result.sections[0].cheatSheet).toEqual({ de: "- `show vlan`", en: "- `show vlan`" });
    expect(result.questions[0].options[1].rationale).toBeUndefined();
  });

  it("toMonoObjectiveContent schickt bei Reparaturen nur eine Sprachfassung zurück", () => {
    const mono = toMonoObjectiveContent(content([monoQuestion("Was trennt ein VLAN?")]), "de");
    expect(mono.sections[0].title).toBe("VLAN");
    expect(mono.questions[0].question).toBe("Was trennt ein VLAN?");
  });

  it("der Prompt verlangt nur die Kurssprache, Systemprompt getrennt und Quellen vor dem Lernziel", async () => {
    let call: { contents: string; config: { systemInstruction?: string } } | undefined;
    const client = {
      models: {
        generateContent: async (args: typeof call) => {
          call = args;
          return { text: JSON.stringify({ sections: [monoSection], questions: [monoQuestion("Was trennt ein VLAN?")] }), usageMetadata: {} };
        },
      },
    } as unknown as GoogleGenAI;
    await createHaikuContentProvider(client).generateObjective(
      {
        courseTitle: "Netze", language: "en", withQuestions: true, objective,
        domain: { id: "d", title: "D", weight: 1, objectives: [] }, sourceExcerpts: [{ locator: "Abschnitt 1", text: "VLAN-Text" }],
      },
      () => undefined,
    );
    expect(call!.config.systemInstruction).toContain("ausschließlich auf Englisch");
    expect(call!.config.systemInstruction).not.toMatch(/bilingual/);
    expect(call!.config.systemInstruction).toContain("Lass `rationale` bei allen Optionen weg");
    expect(call!.contents.indexOf("VLAN-Text")).toBeLessThan(call!.contents.indexOf('Objective "VLANs"'));
  });

  it("Lern- und Reparatur-Provider mit demselben Modell sind erkennbar (die Eskalation entfällt dann)", () => {
    expect(createSonnetRepairProvider().model === createHaikuContentProvider().model).toBe(true);
  });
});

describe("Reparaturen ohne KI", () => {
  it("unbekannter Quellenverweis wird auf null gesetzt statt das Lernziel neu zu erzeugen", () => {
    const fixed = autoFixObjectiveContent(content([monoQuestion("Frage 1", "Kapitel 99")]), [{ locator: "Abschnitt 1", text: "x" }]);
    expect(fixed.content.questions[0].sourceLocator).toBeNull();
    expect(validateObjectiveContent({ ...objective, recommendedQuestions: 1 }, fixed.content, [{ locator: "Abschnitt 1", text: "x" }])).toEqual([]);
  });

  it("doppelte Fragen fallen weg; danach fehlen nur Fragen → Teil-Reparatur statt Komplett-Reparatur", () => {
    const fixed = autoFixObjectiveContent(content([monoQuestion("Frage 1"), monoQuestion("frage  1"), monoQuestion("Frage 2")]), [{ locator: "Abschnitt 1", text: "x" }]);
    expect(fixed.content.questions).toHaveLength(2);
    const errors = validateObjectiveContent(objective, fixed.content, [{ locator: "Abschnitt 1", text: "x" }]);
    expect(missingQuestionsOnly(objective, fixed.content, errors)).toEqual({ count: 1, requireScenario: false });
  });

  it("fehlt ein Konzept in der Lektion, bleibt es bei der Komplett-Reparatur", () => {
    const c = content([monoQuestion("Frage 1")]);
    const errors = validateObjectiveContent({ ...objective, requiredConcepts: ["spanning tree"] }, c, []);
    expect(missingQuestionsOnly(objective, c, errors)).toBeNull();
  });

  it("einsprachige Lektionen werden nur einmal geprüft (keine doppelten Meldungen je Sprache)", () => {
    const c = content([monoQuestion("Frage 1")]);
    c.sections[0].content = { de: ":::steps\n- a | b", en: ":::steps\n- a | b" };
    const errors = validateObjectiveContent({ ...objective, recommendedQuestions: 1 }, c, []);
    expect(errors.filter((e) => e.startsWith("Lektion 1 (en)"))).toEqual([]);
  });
});

describe("Text- und HTML-Quellen in Abschnitte zerlegen", () => {
  it("kurzer Text bleibt ein Abschnitt", () => {
    expect(splitIntoSections("kurz")).toEqual([{ locator: "Abschnitt 1", text: "kurz" }]);
  });

  it("langer Text wird an Überschriften getrennt, mit Überschrift im Locator", () => {
    const text = ["# Backups", "a".repeat(5000), "", "# Monitoring", "b".repeat(5000)].join("\n");
    const sections = splitIntoSections(text);
    expect(sections.map((s) => s.locator)).toEqual(["Abschnitt 1: Backups", "Abschnitt 2: Monitoring"]);
    expect(sections.every((s) => s.text.length <= 6_000)).toBe(true);
  });

  it("HTML-Überschriften bleiben nach stripHtml als Trennstellen erkennbar", () => {
    const html = `<h2>Teil A</h2><p>${"x ".repeat(3000)}</p><h2>Teil B</h2><p>${"y ".repeat(3000)}</p>`;
    expect(splitIntoSections(stripHtml(html)).map((s) => s.locator)).toEqual(["Abschnitt 1: Teil A", "Abschnitt 2: Teil B"]);
  });

  it("ein überlanger Abschnitt ohne Überschriften wird an Absätzen geteilt, nichts geht verloren", () => {
    const text = Array.from({ length: 20 }, (_, i) => `Absatz ${i} ${"z".repeat(900)}`).join("\n\n");
    const sections = splitIntoSections(text);
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.map((s) => s.text).join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });
});

describe("Kostenschätzung mit Kontext-Cache", () => {
  it("gecachte Eingabe-Token kosten 10 % des Eingabepreises", () => {
    const full = estimateCostUsd(1_000_000, 0, "gemini-3.8-flash")!;
    const cached = estimateCostUsd(1_000_000, 0, "gemini-3.8-flash", 1_000_000)!;
    expect(full).toBeCloseTo(0.75);
    expect(cached).toBeCloseTo(0.075);
  });
});
