import { beforeEach, describe, expect, it, vi } from "vitest";

const generateStructured = vi.fn();
vi.mock("@/lib/ai/generate", () => ({ generateStructured: (...args: unknown[]) => generateStructured(...args) }));

import {
  chunkObjective,
  createChunkTranslator,
  QUESTIONS_PER_CHUNK,
  translationDirection,
  translationSystemPrompt,
  translationUserPrompt,
  TranslationValidationError,
  validateTranslation,
  type QuestionItem,
  type SectionItem,
  type TranslationChunk,
  type TranslationResponse,
} from "./translate";

const lessonText = ["## Grundlagen", "", "Eine Firewall filtert Pakete.", "", "```bash", "iptables -L", "```", "", ":::exam", "Prüfungsrelevant", ":::"].join("\n");

const section: SectionItem = {
  key: "s1",
  sectionId: "sec-1",
  lessonId: "les-1",
  title: "Grundlagen",
  content: lessonText,
  keyTakeaways: ["a", "b"],
  examFocusPoints: ["c", "d"],
  cheatSheet: "- Merkpunkt",
};

const question: QuestionItem = {
  key: "q1",
  questionId: "que-1",
  question: "Was ist NICHT Aufgabe einer Firewall?",
  explanation: "Weil …",
  options: [
    { id: "o1", text: "Pakete filtern", rationale: "falsch, weil …" },
    { id: "o2", text: "Viren entfernen", rationale: null },
  ],
};

const chunk: TranslationChunk = { objectiveTitle: "Netzwerksicherheit", sections: [section], questions: [question] };

function goodResponse(): TranslationResponse {
  return {
    sections: [
      {
        key: "s1",
        title: "Basics",
        content: lessonText.replace("Grundlagen", "Basics").replace("Eine Firewall filtert Pakete.", "A firewall filters packets."),
        keyTakeaways: ["a", "b"],
        examFocusPoints: ["c", "d"],
        cheatSheet: "- Key point",
      },
    ],
    questions: [
      {
        key: "q1",
        question: "What is NOT a firewall's job?",
        explanation: "Because …",
        options: [
          { text: "Filter packets", rationale: "wrong because …" },
          { text: "Remove viruses", rationale: null },
        ],
      },
    ],
  };
}

describe("validateTranslation", () => {
  it("accepts a complete translation", () => {
    expect(validateTranslation(chunk, goodResponse())).toEqual([]);
  });

  it("reports missing entries", () => {
    const r = goodResponse();
    r.questions = [];
    expect(validateTranslation(chunk, r)).toContain("q1 fehlt");
  });

  it("reports changed list lengths and missing rationales", () => {
    const r = goodResponse();
    r.sections[0].keyTakeaways = ["a"];
    r.questions[0].options[0].rationale = null;
    const problems = validateTranslation(chunk, r);
    expect(problems).toContain("s1.keyTakeaways: Anzahl weicht ab");
    expect(problems).toContain("q1.options[0].rationale fehlt");
  });

  it("reports a different number of answer options", () => {
    const r = goodResponse();
    r.questions[0].options.pop();
    expect(validateTranslation(chunk, r)).toContain("q1: Anzahl der Antwortoptionen weicht ab");
  });

  it("reports lost code blocks and learning blocks", () => {
    const r = goodResponse();
    r.sections[0].content = "## Basics\n\nA firewall filters packets.";
    const problems = validateTranslation(chunk, r);
    expect(problems).toContain("s1.content: Anzahl der Code-Blöcke weicht ab");
    expect(problems).toContain("s1.content: Anzahl der :::-Blöcke weicht ab");
  });

  it("reports a suspiciously short translation of a long text", () => {
    const long = "Langer Absatz mit vielen Details. ".repeat(30);
    const c: TranslationChunk = { ...chunk, sections: [{ ...section, content: long }], questions: [] };
    const r = goodResponse();
    r.questions = [];
    r.sections[0].content = "Short summary.";
    expect(validateTranslation(c, r)).toContain("s1.content: Übersetzung ist verdächtig kurz");
  });

  it("reports a missing cheat sheet", () => {
    const r = goodResponse();
    r.sections[0].cheatSheet = null;
    expect(validateTranslation(chunk, r)).toContain("s1.cheatSheet fehlt");
  });
});

describe("prompts", () => {
  it("system prompt depends only on the direction (cacheable) and keeps negations and code", () => {
    const prompt = translationSystemPrompt("de", "en");
    expect(prompt).toBe(translationSystemPrompt("de", "en"));
    expect(prompt).toContain("von Deutsch nach Englisch");
    expect(prompt).toMatch(/Verneinungen/);
    expect(prompt).toMatch(/Code-Blöcke/);
    expect(translationSystemPrompt("en", "de")).toContain("von Englisch nach Deutsch");
  });

  it("user prompt never contains IDs or which answer is correct", () => {
    const user = translationUserPrompt(chunk);
    expect(user).toContain("Netzwerksicherheit");
    expect(user).toContain("Was ist NICHT Aufgabe einer Firewall?");
    expect(user).not.toContain("que-1");
    expect(user).not.toContain("o1");
    expect(user).not.toMatch(/isCorrect/);
  });
});

describe("chunkObjective", () => {
  it("translates each lesson on its own and questions in small groups", () => {
    const questions = Array.from({ length: QUESTIONS_PER_CHUNK + 3 }, (_, i) => ({ ...question, key: `q${i + 1}`, questionId: `q-${i}` }));
    const chunks = chunkObjective("Ziel", [section, { ...section, key: "s2" }], questions);
    expect(chunks.map((c) => [c.sections.length, c.questions.length])).toEqual([
      [1, 0],
      [1, 0],
      [0, QUESTIONS_PER_CHUNK],
      [0, 3],
    ]);
  });
});

describe("translationDirection", () => {
  it("translates into the other language; courses without a language count as German", () => {
    expect(translationDirection("de")).toEqual({ source: "de", target: "en" });
    expect(translationDirection("en")).toEqual({ source: "en", target: "de" });
    expect(translationDirection(null)).toEqual({ source: "de", target: "en" });
  });
});

describe("createChunkTranslator", () => {
  beforeEach(() => generateStructured.mockReset());

  it("uses the given model and returns a valid answer after one call", async () => {
    generateStructured.mockResolvedValueOnce(goodResponse());
    const result = await createChunkTranslator(undefined, undefined, "lite-model")(chunk, "de", "en");
    expect(result.sections[0].title).toBe("Basics");
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(generateStructured.mock.calls[0][3]).toBe("lite-model");
  });

  it("retries once with the problems when the answer is incomplete", async () => {
    const incomplete = goodResponse();
    incomplete.questions = [];
    generateStructured.mockResolvedValueOnce(incomplete).mockResolvedValueOnce(goodResponse());
    await createChunkTranslator()(chunk, "de", "en");
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(generateStructured.mock.calls[1][1]).toContain("q1 fehlt");
  });

  it("gives up after the second incomplete answer", async () => {
    const incomplete = goodResponse();
    incomplete.questions = [];
    generateStructured.mockResolvedValue(incomplete);
    await expect(createChunkTranslator()(chunk, "de", "en")).rejects.toBeInstanceOf(TranslationValidationError);
  });
});

describe("validateTranslation: Simulationen", () => {
  const sim = (goal: string, accept: string) =>
    "```simulation\n" + JSON.stringify({ type: "terminal", title: "T", scenario: "S", steps: [{ goal, accept: [accept], output: "x", hint: "h" }], success: "ok" }) + "\n```";
  const withSim = (content: string): TranslationChunk => ({ ...chunk, sections: [{ ...section, content }] });
  const response = (content: string): TranslationResponse => {
    const r = goodResponse();
    return { ...r, sections: [{ ...r.sections[0], content }] };
  };
  it("übersetzte Texte sind in Ordnung, geänderte Befehle oder kaputtes JSON nicht", () => {
    const c = withSim(sim("Zeige Dateien", "ls -la"));
    expect(validateTranslation(c, response(sim("List files", "ls -la")))).toEqual([]);
    expect(validateTranslation(c, response(sim("List files", "ls -l"))).join()).toMatch(/Simulation 1 wurde verändert/);
    expect(validateTranslation(c, response("```simulation\n{\"type\":\n```")).join()).toMatch(/Simulation 1 ist nach der Übersetzung ungültig/);
  });
});

describe("Übersetzung nach token_architektur_roadmap Abschnitt 6", () => {
  beforeEach(() => generateStructured.mockReset());

  it("läuft mit Denkstufe low", async () => {
    generateStructured.mockResolvedValueOnce(goodResponse());
    await createChunkTranslator()(chunk, "de", "en");
    expect(generateStructured.mock.calls[0][6]).toEqual({ thinkingLevel: "low" });
  });

  it("Systemprompt: Do-Not-Translate-Liste (per Env ergänzbar) und Schutz der Quellenbelege", () => {
    vi.stubEnv("COURSE_TRANSLATION_DO_NOT_TRANSLATE", "Nordlicht-Portal, Kubernetes");
    const prompt = translationSystemPrompt("de", "en");
    vi.unstubAllEnvs();
    expect(prompt).toMatch(/unübersetzt.*Deployment, Pipeline, Prompt/);
    expect(prompt).toContain("Nordlicht-Portal, Kubernetes");
    expect(prompt).toContain("`[SRC_07]`");
  });

  it("ein verlorener oder veränderter Quellenbeleg macht die Übersetzung ungültig", () => {
    const withTags: TranslationChunk = { ...chunk, sections: [{ ...section, content: `${lessonText}\n\nGilt 30 Tage [SRC_07]. Frist [QUELLE FEHLT: Frist].` }] };
    const ok = goodResponse();
    ok.sections[0].content = `${ok.sections[0].content}\n\nValid for 30 days [SRC_07]. Deadline [QUELLE FEHLT: deadline].`;
    expect(validateTranslation(withTags, ok)).toEqual([]);
    const lost = goodResponse();
    lost.sections[0].content = `${lost.sections[0].content}\n\nValid for 30 days [SRC_7]. Deadline [SOURCE MISSING: deadline].`;
    const problems = validateTranslation(withTags, lost);
    expect(problems.some((p) => p.includes("[SRC_…]"))).toBe(true);
    expect(problems.some((p) => p.includes("[QUELLE FEHLT"))).toBe(true);
  });
});
