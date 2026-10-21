/** KI-Nachbesserung der Werkstatt (echte DB nur mit TEST_DATABASE_URL; die KI ist immer ersetzt). */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, contentReports, contentRevisions, courseCheckpoints, domains, lessons, objectives, questionOptions, questions, sections } from "@/lib/server/db/schema";
import { translateCourse } from "@/lib/server/course-translation/service";
import type { ChunkTranslator } from "@/lib/server/course-translation/translate";
import { aiRequestSchema, AiEditError, createObjectiveWithContent, ensureAiCheckpoint, estimateAi, finishAiAccept, proposeAi, type Generate } from "./ai";
import { sectionSystemPrompt } from "./ai-prompt";
import { EditValidationError, getSectionForEditor, readQuestion, saveQuestion, saveSection } from "./service";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);

/** Antworten der „KI“ der Reihe nach; merkt sich die Prompts. */
function fakeAi(...responses: unknown[]) {
  const prompts: Array<{ system: string; user: string }> = [];
  const generate: Generate = async (system, user) => {
    prompts.push({ system, user });
    if (!responses.length) throw new Error("keine Antwort mehr");
    return responses.shift() as never;
  };
  return { generate, prompts };
}

const decisionSim = {
  type: "decision",
  title: "Entscheidung",
  scenario: "Der Shop ist nicht erreichbar.",
  review: ["Ursache finden"],
  start: "a",
  nodes: [
    { id: "a", text: "Was prüfst du zuerst?", choices: [{ label: "Logs", next: "ok", feedback: "Gut." }, { label: "Neu installieren", next: "bad", feedback: "Zu früh." }] },
    { id: "ok", text: "Ursache gefunden.", outcome: "success" },
    { id: "bad", text: "Daten weg.", outcome: "failure" },
  ],
};

const lessonAi = (content: string, extra: Record<string, unknown> = {}) => ({ title: "Neuer Titel", content, keyTakeaways: ["a", "b"], examFocusPoints: ["c"], cheatSheet: null, changes: "lebendiger", ...extra });

describe("Anfragen und Prompts", () => {
  it("„Eigene Anweisung“ braucht eine Anweisung", () => {
    const id = randomUUID();
    expect(aiRequestSchema.safeParse({ target: "section", id, action: "custom" }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ target: "section", id, action: "custom", instruction: "Kürzer." }).success).toBe(true);
    expect(aiRequestSchema.safeParse({ target: "question", id, action: "lively" }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ target: "objective", id, action: "add_questions", count: 50 }).success).toBe(false);
  });
  it("Systemprompt enthält die Lernblock- und Stilregeln und den Auftrag", () => {
    const p = sectionSystemPrompt({ name: "Buchhaltung", locale: "de", objective: { code: "1.1", title: "Belege", description: null }, domain: "D" }, "simulation");
    expect(p).toContain("[!POSSIBLE]");
    expect(p).toContain("```simulation".slice(3));
    expect(p).toContain("genau eine interaktive Simulation");
    expect(p).toContain("ausschließlich auf Deutsch");
  });
});

run("KI-Nachbesserung (echte DB)", () => {
  const certIds: string[] = [];
  let prevAuto: string | undefined;
  beforeAll(() => {
    // Kein echter Übersetzungslauf im Test.
    prevAuto = process.env.COURSE_AUTO_TRANSLATE;
    process.env.COURSE_AUTO_TRANSLATE = "0";
  });
  afterAll(async () => {
    if (prevAuto === undefined) delete process.env.COURSE_AUTO_TRANSLATE;
    else process.env.COURSE_AUTO_TRANSLATE = prevAuto;
    if (certIds.length) await getDb().delete(certifications).where(inArray(certifications.id, certIds));
  });

  async function mk(opts: { translated?: boolean } = {}) {
    const d = getDb();
    const [c] = await d
      .insert(certifications)
      .values({ slug: `ai-${certIds.length}-${tag}`, name: "Kurs", provider: "T", examName: "T", examVersion: "1", contentLocale: "de", translatedAt: opts.translated ? new Date() : null })
      .returning({ id: certifications.id });
    certIds.push(c.id);
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
    const [obj] = await d.insert(objectives).values({ domainId: dom.id, code: "1.1", title: "O" }).returning();
    const [sec] = await d.insert(sections).values({ objectiveId: obj.id, orderNum: 1, title: opts.translated ? { de: "Titel", en: "Title" } : { de: "Titel", en: "Titel" } }).returning();
    const content = opts.translated ? { de: "## Ursache finden\nAlt.", en: "## Find the cause\nOld." } : { de: "## Ursache finden\nAlt.", en: "## Ursache finden\nAlt." };
    const [lesson] = await d.insert(lessons).values({ sectionId: sec.id, content }).returning();
    const [q] = await d
      .insert(questions)
      .values({ humanId: `AI-${tag}-${certIds.length}-Q001`, objectiveId: obj.id, difficulty: "beginner", type: "knowledge", question: { de: "Frage?", en: opts.translated ? "Question?" : "Frage?" }, explanation: { de: "Weil.", en: opts.translated ? "Because." : "Weil." } })
      .returning();
    const opt = await d
      .insert(questionOptions)
      .values([
        { questionId: q.id, orderNum: 1, text: { de: "Ja", en: opts.translated ? "Yes" : "Ja" }, isCorrect: true },
        { questionId: q.id, orderNum: 2, text: { de: "Nein", en: opts.translated ? "No" : "Nein" }, isCorrect: false },
      ])
      .returning();
    return { certId: c.id, domainId: dom.id, objectiveId: obj.id, sectionId: sec.id, lessonId: lesson.id, questionId: q.id, optionIds: opt.map((o) => o.id) };
  }

  it("Lektion: Vorschlag ändert nichts in der Datenbank und gilt bei einsprachigen Kursen für beide Felder", async () => {
    const k = await mk();
    const ai = fakeAi(lessonAi("## Ursache finden\nNeu und lebendig.\n\n> [!POSSIBLE]\n> Du kannst jetzt X."));
    const p = await proposeAi(k.certId, { target: "section", id: k.sectionId, action: "lively" }, { generate: ai.generate });
    expect(p.kind).toBe("section");
    if (p.kind !== "section") return;
    expect(p.snapshot.content.de).toContain("Neu und lebendig");
    expect(p.snapshot.content.en).toBe(p.snapshot.content.de);
    expect(p.snapshot.title).toEqual({ de: "Neuer Titel", en: "Neuer Titel" });
    expect(p.costUsd).toBeNull();
    expect(ai.prompts[0].user).toContain("Ursache finden");
    const now = await getSectionForEditor(k.certId, k.sectionId);
    expect(now.snapshot.content.de).toBe("## Ursache finden\nAlt.");
    expect(p.baseFingerprint).toBe(now.fingerprint);
  });

  it("Übersetzter Kurs: nur die Kurssprache ändert sich, die andere wird veraltet markiert und neu übersetzt", async () => {
    const k = await mk({ translated: true });
    const p = await proposeAi(k.certId, { target: "section", id: k.sectionId, action: "expand" }, { generate: fakeAi(lessonAi("## Ursache finden\nViel mehr.")).generate });
    if (p.kind !== "section") throw new Error("kind");
    expect(p.snapshot.content).toEqual({ de: "## Ursache finden\nViel mehr.", en: "## Find the cause\nOld." });

    const { name } = await ensureAiCheckpoint(k.certId, null);
    await saveSection(k.certId, k.sectionId, p.snapshot, p.baseFingerprint, { userId: null, origin: "ai", note: "KI: Ausführlicher erklären" });
    const after = await finishAiAccept(k.certId, { sections: [k.sectionId] }, { userId: null, checkpoint: name });
    expect(after.translation).toBe("off");
    const [l] = await getDb().select().from(lessons).where(eq(lessons.id, k.lessonId));
    expect(l.translationOutdated).toBe(true);
    const [rev] = await getDb().select().from(contentRevisions).where(and(eq(contentRevisions.targetId, k.sectionId), eq(contentRevisions.origin, "ai")));
    expect(rev.note).toContain("KI");

    // Der Übersetzungslauf nimmt die veraltete Lektion mit (obwohl beide Sprachen verschieden sind) und setzt das Feld zurück.
    const seen: string[] = [];
    const translator: ChunkTranslator = async (chunk) => {
      seen.push(...chunk.sections.map((s) => s.content));
      return {
        sections: chunk.sections.map((s) => ({ key: s.key, title: "New title", content: "## Find the cause\nMuch more.", keyTakeaways: s.keyTakeaways ?? [], examFocusPoints: s.examFocusPoints ?? [], cheatSheet: null })),
        questions: [],
      } as never;
    };
    await translateCourse(k.certId, translator);
    expect(seen).toEqual(["## Ursache finden\nViel mehr."]);
    const [l2] = await getDb().select().from(lessons).where(eq(lessons.id, k.lessonId));
    expect(l2.translationOutdated).toBe(false);
    expect(l2.content.en).toBe("## Find the cause\nMuch more.");
  });

  it("Fehlerhafte Lernblöcke: ein Korrekturversuch mit den Fehlern; Simulation ohne Simulation scheitert", async () => {
    const k = await mk();
    const ai = fakeAi(lessonAi("Text\n:::practice\n### Szenario\nx\n:::"), lessonAi(`## Ursache finden\nText\n\n\`\`\`simulation\n${JSON.stringify(decisionSim)}\n\`\`\``));
    const p = await proposeAi(k.certId, { target: "section", id: k.sectionId, action: "simulation" }, { generate: ai.generate });
    expect(ai.prompts).toHaveLength(2);
    expect(ai.prompts[1].user).toContain("fehlerhafte Lernblöcke");
    if (p.kind !== "section") throw new Error("kind");
    expect(p.repaired).toBe(false);
    expect(p.snapshot.content.de).toContain("```simulation");

    await expect(proposeAi(k.certId, { target: "section", id: k.sectionId, action: "simulation" }, { generate: fakeAi(lessonAi("Nur Text.")).generate })).rejects.toBeInstanceOf(AiEditError);
  });

  it("Frage: Optionen behalten IDs und Plätze; geänderte Anzahl wird abgelehnt; gemeldete Fehler werden geschlossen", async () => {
    const k = await mk();
    await getDb().insert(contentReports).values({ targetType: "question", targetId: k.questionId, reason: "incorrect" });
    const ai = fakeAi({ question: "Klarere Frage?", explanation: "Weil so.", difficulty: "intermediate", type: "scenario", options: [{ text: "Ja", isCorrect: false, rationale: "Nein." }, { text: "Nein", isCorrect: true, rationale: null }], changes: "Lösung korrigiert" });
    const p = await proposeAi(k.certId, { target: "question", id: k.questionId, action: "fix_reports" }, { generate: ai.generate });
    expect(ai.prompts[0].user).toContain("1× fachlich falsch");
    if (p.kind !== "question") throw new Error("kind");
    expect(p.snapshot.options.map((o) => o.id)).toEqual(k.optionIds);
    expect(p.snapshot.options[1].isCorrect).toBe(true);
    await saveQuestion(k.certId, k.questionId, p.snapshot, p.baseFingerprint, { userId: null, origin: "ai" });
    await finishAiAccept(k.certId, { questions: [k.questionId] }, { userId: null, resolveReports: true, checkpoint: null });
    const [r] = await getDb().select().from(contentReports).where(eq(contentReports.targetId, k.questionId));
    expect(r.status).toBe("resolved");
    expect((await readQuestion(getDb(), k.questionId))!.question.de).toBe("Klarere Frage?");

    const bad = fakeAi({ question: "Q", explanation: "E", difficulty: "beginner", type: "knowledge", options: [{ text: "a", isCorrect: true, rationale: null }, { text: "b", isCorrect: false, rationale: null }, { text: "c", isCorrect: false, rationale: null }], changes: "" });
    await expect(proposeAi(k.certId, { target: "question", id: k.questionId, action: "improve" }, { generate: bad.generate })).rejects.toBeInstanceOf(AiEditError);
  });

  it("Neue Fragen: höchstens die gewünschte Anzahl, in beiden Sprachfeldern", async () => {
    const k = await mk();
    const q = (n: number) => ({ question: `Neu ${n}?`, explanation: "E", difficulty: "beginner", type: "application", options: [1, 2, 3, 4].map((i) => ({ text: `o${i}`, isCorrect: i === 1, rationale: null })) });
    const ai = fakeAi({ questions: [q(1), q(2), q(3)] });
    const p = await proposeAi(k.certId, { target: "objective", id: k.objectiveId, action: "add_questions", count: 2 }, { generate: ai.generate });
    expect(ai.prompts[0].user).toContain("Frage?");
    if (p.kind !== "questions") throw new Error("kind");
    expect(p.questions).toHaveLength(2);
    expect(p.questions[0].question).toEqual({ de: "Neu 1?", en: "Neu 1?" });
  });

  it("Fehlendes Lernziel: anlegen mit Lektionen und Fragen; vorhandener Code wird abgelehnt", async () => {
    const k = await mk();
    const ai = fakeAi({
      title: "Neues Lernziel",
      description: "Beschreibung",
      sections: [{ title: "L1", estimatedMinutes: 10, difficulty: "beginner", content: "## Start\nText", keyTakeaways: ["a", "b"], examFocusPoints: ["c", "d"] }],
      questions: [{ question: "Q?", explanation: "E", difficulty: "beginner", type: "knowledge", options: [1, 2, 3, 4].map((i) => ({ text: `o${i}`, isCorrect: i === 2, rationale: null })) }],
    });
    const p = await proposeAi(k.certId, { target: "missing-objective", domainId: k.domainId, code: "1.2", title: "Offiziell", action: "add_objective" }, { generate: ai.generate });
    if (p.kind !== "objective") throw new Error("kind");
    const created = await createObjectiveWithContent(k.certId, { domainId: p.domainId, code: p.code, title: p.title, description: p.description, sections: p.sections, questions: p.questions });
    expect(created.sectionIds).toHaveLength(1);
    expect(created.questionIds).toHaveLength(1);
    const [o] = await getDb().select().from(objectives).where(eq(objectives.id, created.objectiveId));
    expect(o.code).toBe("1.2");
    await expect(proposeAi(k.certId, { target: "missing-objective", domainId: k.domainId, code: "1.1", title: "x", action: "add_objective" }, { generate: fakeAi().generate })).rejects.toBeInstanceOf(EditValidationError);
  });

  it("Automatisch gemerkter Stand: einmal je Überarbeitungsrunde", async () => {
    const k = await mk();
    const first = await ensureAiCheckpoint(k.certId, null);
    const second = await ensureAiCheckpoint(k.certId, null);
    expect(first.created).toBe(true);
    expect(second).toEqual({ created: false, name: first.name });
    const later = await ensureAiCheckpoint(k.certId, null, new Date(Date.now() + 7 * 3600_000));
    expect(later.created).toBe(true);
    const cps = await getDb().select().from(courseCheckpoints).where(eq(courseCheckpoints.certificationId, k.certId));
    expect(cps).toHaveLength(2);
  });

  it("Kostenschätzung je Aktion, ohne KI", async () => {
    const k = await mk();
    const est = await estimateAi(k.certId, { target: "section", id: k.sectionId });
    expect(est.map((e) => e.action)).toContain("simulation");
    const sim = est.find((e) => e.action === "simulation")!;
    const lively = est.find((e) => e.action === "lively")!;
    expect(sim.outputTokens).toBeGreaterThan(lively.outputTokens);
    expect((await estimateAi(k.certId, { target: "objective", id: k.objectiveId, count: 5 }))[0].action).toBe("add_questions");
  });
});
