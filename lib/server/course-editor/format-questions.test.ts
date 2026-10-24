/** Werkstatt und KI für Fragen mit Reihenfolge, Kurzantwort und Zuordnung (echte DB nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, lessons, objectives, sections } from "@/lib/server/db/schema";
import { computeCourseFingerprints } from "@/lib/server/approvals/service";
import { translateCourse } from "@/lib/server/course-translation/service";
import type { ChunkTranslator } from "@/lib/server/course-translation/translate";
import { aiRequestSchema, AiEditError, proposeAi, toFormatQuestion, type Generate } from "./ai";
import { createQuestion, EditValidationError, getObjectiveQuestions, readQuestion, saveQuestion } from "./service";
import { newQuestionSchema, questionSnapshotSchema, type NewQuestion } from "./snapshots";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);
const bi = (de: string, en = de) => ({ de, en });
const base = { explanation: bi("Weil.", "Because."), difficulty: "beginner" as const, type: "application" as const, options: [] };

const ordering: NewQuestion = { ...base, question: bi("Reihenfolge?", "Order?"), format: "ordering", answerData: { steps: [{ id: "s1", text: bi("A") }, { id: "s2", text: bi("B") }, { id: "s3", text: bi("C") }] } };
const short: NewQuestion = { ...base, question: bi("Befehl?", "Command?"), format: "short_answer", answerData: { accepted: ["ipconfig /all"] } };
const matching: NewQuestion = { ...base, question: bi("Zuordnen.", "Match."), format: "matching", answerData: { pairs: [{ id: "p1", left: bi("DNS"), right: bi("Namen", "Names") }, { id: "p2", left: bi("DHCP"), right: bi("Adressen", "Addresses") }] } };

describe("Schemas", () => {
  it("Formatfragen brauchen gültige Lösungsdaten und keine Optionen", () => {
    expect(newQuestionSchema.safeParse(ordering).success).toBe(true);
    expect(newQuestionSchema.safeParse({ ...ordering, answerData: { steps: [{ id: "s1", text: bi("A") }] } }).success).toBe(false);
    expect(newQuestionSchema.safeParse({ ...short, answerData: { accepted: ["  "] } }).success).toBe(false);
    expect(newQuestionSchema.safeParse({ ...matching, options: [{ text: bi("x"), isCorrect: true, rationale: null }] }).success).toBe(false);
  });
  it("Auswahlfragen bleiben wie bisher: 2 Optionen, genau eine richtig, keine Lösungsdaten", () => {
    const opt = (isCorrect: boolean) => ({ text: bi("a"), isCorrect, rationale: null });
    expect(newQuestionSchema.safeParse({ ...base, question: bi("q"), options: [opt(true), opt(false)] }).success).toBe(true);
    expect(newQuestionSchema.safeParse({ ...base, question: bi("q"), options: [] }).success).toBe(false);
    expect(newQuestionSchema.safeParse({ ...base, question: bi("q"), options: [opt(true), opt(false)], answerData: { accepted: ["x"] } }).success).toBe(false);
    expect(questionSnapshotSchema.safeParse({ ...base, question: bi("q"), options: [] }).success).toBe(false);
  });
  it("KI-Antwort wird zur Formatfrage; Unbrauchbares fällt weg", () => {
    const common = { question: "Q?", explanation: "E", difficulty: "beginner" as const, type: "application" as const, steps: [], accepted: [], pairs: [] };
    expect(toFormatQuestion({ ...common, format: "ordering", steps: ["A", "B", "C"] })?.answerData).toMatchObject({ steps: [{ id: "s1" }, { id: "s2" }, { id: "s3" }] });
    expect(toFormatQuestion({ ...common, format: "short_answer", accepted: ["Port 443", "port  443"] })?.answerData).toEqual({ accepted: ["Port 443"] });
    expect(toFormatQuestion({ ...common, format: "ordering", steps: ["A"] })).toBeNull();
    expect(toFormatQuestion({ ...common, format: "matching", pairs: [{ left: "x", right: "y" }, { left: "z", right: "y" }] })).toBeNull();
  });
  it("Anfrage „Formatfragen ergänzen“ ist erlaubt", () => {
    expect(aiRequestSchema.safeParse({ target: "objective", id: randomUUID(), action: "add_format_questions", count: 3 }).success).toBe(true);
  });
});

run("Formatfragen in der Werkstatt (echte DB)", () => {
  const certIds: string[] = [];
  afterAll(async () => {
    if (certIds.length) await getDb().delete(certifications).where(inArray(certifications.id, certIds));
  });
  async function mk() {
    const d = getDb();
    const [c] = await d.insert(certifications).values({ slug: `fmt-${certIds.length}-${tag}`, name: "K", provider: "T", examName: "T", examVersion: "1", contentLocale: "de" }).returning({ id: certifications.id });
    certIds.push(c.id);
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
    const [obj] = await d.insert(objectives).values({ domainId: dom.id, code: "1.1", title: "O" }).returning();
    const [sec] = await d.insert(sections).values({ objectiveId: obj.id, orderNum: 1, title: bi("L") }).returning();
    await d.insert(lessons).values({ sectionId: sec.id, content: bi("## Ablauf\nErst A, dann B, dann C.") });
    return { certId: c.id, objectiveId: obj.id };
  }
  const actor = { userId: null, origin: "manual" as const };

  it("anlegen, lesen, speichern; Format lässt sich nicht ändern; Revision entsteht", async () => {
    const k = await mk();
    const created = await createQuestion(k.certId, k.objectiveId, short);
    const snapshot = (await readQuestion(getDb(), created.questionId))!;
    expect(snapshot).toMatchObject({ format: "short_answer", answerData: { accepted: ["ipconfig /all"] }, options: [] });
    expect(created.fingerprint).toBeTruthy();

    const next = { ...snapshot, answerData: { accepted: ["ipconfig /all", "ipconfig/all"] } };
    const saved = await saveQuestion(k.certId, created.questionId, next, created.fingerprint, actor);
    expect(saved.changed).toBe(true);
    expect(((await readQuestion(getDb(), created.questionId))!.answerData as { accepted: string[] }).accepted).toHaveLength(2);

    const asChoice = { ...next, format: undefined, answerData: undefined };
    await expect(saveQuestion(k.certId, created.questionId, asChoice as never, saved.fingerprint, actor)).rejects.toBeInstanceOf(EditValidationError);
    const all = await getObjectiveQuestions(k.certId, k.objectiveId);
    expect(all).toHaveLength(1);
  });

  it("Freigabe-Fingerabdruck ändert sich, wenn sich die Lösung ändert", async () => {
    const k = await mk();
    const q = await createQuestion(k.certId, k.objectiveId, ordering);
    const before = (await computeCourseFingerprints(k.certId)).questions[q.questionId];
    const snap = (await readQuestion(getDb(), q.questionId))!;
    const steps = (snap.answerData as { steps: unknown[] }).steps;
    await saveQuestion(k.certId, q.questionId, { ...snap, answerData: { steps: [...steps].reverse() } as never }, q.fingerprint, actor);
    expect((await computeCourseFingerprints(k.certId)).questions[q.questionId]).not.toBe(before);
  });

  it("KI: Formatfragen vorschlagen; Überarbeiten einer Formatfrage per KI ist nicht möglich", async () => {
    const k = await mk();
    const item = { question: "Ablauf?", explanation: "E", difficulty: "beginner", type: "application", format: "ordering", steps: ["A", "B", "C"], accepted: [], pairs: [] };
    const bad = { ...item, steps: ["A"] };
    const generate: Generate = async () => ({ questions: [item, bad] }) as never;
    const p = await proposeAi(k.certId, { target: "objective", id: k.objectiveId, action: "add_format_questions", count: 3 }, { generate });
    if (p.kind !== "questions") throw new Error("kind");
    expect(p.questions).toHaveLength(1);
    expect(p.questions[0]).toMatchObject({ format: "ordering", options: [] });

    const created = await createQuestion(k.certId, k.objectiveId, p.questions[0]);
    await expect(proposeAi(k.certId, { target: "question", id: created.questionId, action: "improve" }, { generate })).rejects.toBeInstanceOf(AiEditError);
    const none: Generate = async () => ({ questions: [bad] }) as never;
    await expect(proposeAi(k.certId, { target: "objective", id: k.objectiveId, action: "add_format_questions", count: 1 }, { generate: none })).rejects.toBeInstanceOf(AiEditError);
  });

  it("Übersetzung: Schritte, Begriffe und Aussagen laufen mit, die Lösungsreihenfolge bleibt", async () => {
    const k = await mk();
    const de = (t: string) => ({ de: t, en: t });
    const q1 = await createQuestion(k.certId, k.objectiveId, { ...ordering, question: de("Ablauf?"), explanation: de("Weil."), answerData: { steps: [{ id: "s1", text: de("Erkennen") }, { id: "s2", text: de("Eingrenzen") }] } });
    const q2 = await createQuestion(k.certId, k.objectiveId, { ...matching, question: de("Zuordnen."), explanation: de("Weil."), answerData: { pairs: [{ id: "p1", left: de("Dienst"), right: de("Zweck") }, { id: "p2", left: de("Port"), right: de("Eingang") }] } });
    const seen: string[][] = [];
    const translator: ChunkTranslator = async (chunk) => {
      seen.push(...chunk.questions.map((q) => q.options.map((o) => o.text)));
      return {
        sections: chunk.sections.map((x) => ({ key: x.key, title: "T", content: "C", keyTakeaways: x.keyTakeaways ?? [], examFocusPoints: x.examFocusPoints ?? [], cheatSheet: null })),
        questions: chunk.questions.map((q) => ({ key: q.key, question: `EN ${q.question}`, explanation: "Because.", options: q.options.map((o) => ({ text: `EN ${o.text}`, rationale: null })) })),
      } as never;
    };
    await translateCourse(k.certId, translator);
    expect(seen).toContainEqual(["Erkennen", "Eingrenzen"]);
    const o = await readQuestion(getDb(), q1.questionId);
    expect(o!.question.en).toBe("EN Ablauf?");
    expect((o!.answerData as { steps: Array<{ id: string; text: { de: string; en: string } }> }).steps).toEqual([
      { id: "s1", text: { de: "Erkennen", en: "EN Erkennen" } },
      { id: "s2", text: { de: "Eingrenzen", en: "EN Eingrenzen" } },
    ]);
    const m = await readQuestion(getDb(), q2.questionId);
    expect((m!.answerData as { pairs: Array<{ right: { en: string } }> }).pairs.map((p) => p.right.en)).toEqual(["EN Zweck", "EN Eingang"]);
  });
});
