/** Veraltete und fehlende Inhalte neu erzeugen: echte DB, gefälschte KI (nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { recordAiUsage } from "@/lib/server/admin/ai-ledger";
import { awaitBatch, BatchNothingToDoError, estimateBatch, getBatchStatus, startBatch } from "@/lib/server/course-editor/batch";
import { getDb } from "@/lib/server/db/client";
import {
  aiCostEntries,
  certificationSources,
  certifications,
  contentRevisions,
  domains,
  lessons,
  objectiveSourceRefs,
  objectives,
  questionOptions,
  questions,
  sections,
  sourceChunks,
  users,
} from "@/lib/server/db/schema";
import { seedUser } from "@/lib/server/psrp/test-db";
import type { GroundedLessonsAndQuestions } from "@/lib/server/ai/service";
import { MIN_CURRENT_QUESTIONS, regenerateStaleContent, type RegenerationGenerator } from "./stale-regeneration";

const run = TEST_DB ? describe : describe.skip;

const NEW_LESSON = (title: string) =>
  `## ${title}\n\n${"Der aktuelle Stand der Quelle erklärt, wie Zugriffsrechte vergeben, geprüft und entzogen werden. ".repeat(6)}\n\n- Rechte immer nach dem Prinzip der geringsten Rechte vergeben\n- Änderungen nachvollziehbar protokollieren`;

const draftLesson = (sectionOrderNum: number, title: string) => ({
  sectionOrderNum,
  content: { de: NEW_LESSON(`${title} (de)`), en: NEW_LESSON(`${title} (en)`) },
  keyTakeaways: { de: ["Geringste Rechte", "Protokollieren"], en: ["Least privilege", "Log changes"] },
  examFocusPoints: { de: ["Rechtevergabe", "Entzug"], en: ["Granting", "Revoking"] },
  grounded: true,
});

const option = (n: number, isCorrect: boolean) => ({
  text: { de: `Antwortmöglichkeit Nummer ${n} mit genug Text`, en: `Answer option number ${n} with enough text` },
  isCorrect,
  rationale: isCorrect ? undefined : { de: "Das widerspricht der Quelle.", en: "This contradicts the source." },
});

type DraftQuestion = GroundedLessonsAndQuestions["questions"][number];
const draftQuestion = (n: number, overrides: Partial<DraftQuestion> = {}): DraftQuestion => ({
  difficulty: "intermediate",
  type: "scenario",
  question: { de: `Welche Maßnahme passt in Szenario ${n}, wenn ein Konto zu viele Rechte hat und geprüft werden muss?`, en: `Which measure fits scenario ${n} when an account has too many rights and has to be reviewed?` },
  options: [option(1, false), option(2, true), option(3, false), option(4, false)],
  explanation: { de: "Die Quelle verlangt, Rechte auf das nötige Maß zu beschränken und das zu belegen.", en: "The source requires limiting rights to what is needed and documenting it." },
  sourceLocator: "S. 4",
  grounded: true,
  ...overrides,
});

run("Veraltete Inhalte neu erzeugen (echte DB, gefälschte KI)", () => {
  const tag = randomUUID().slice(0, 8);
  let userId = "";
  let certId = "";
  let sourceId = "";
  let chunkP4 = "";
  let objA = "";
  let objB = "";
  let objC = "";
  let secA1 = "";
  let secA2 = "";
  const OLD_TEXT = { de: "Alter Text der veralteten Lektion.", en: "Old text of the stale lesson." };

  const lessonOf = async (sectionId: string) => (await getDb().select().from(lessons).where(eq(lessons.sectionId, sectionId)))[0];
  const currentQuestions = (objectiveId: string) => getDb().select().from(questions).where(and(eq(questions.objectiveId, objectiveId), eq(questions.stale, false))).orderBy(asc(questions.humanId));

  async function addQuestion(objectiveId: string, humanId: string, stale: boolean) {
    const [q] = await getDb()
      .insert(questions)
      .values({ humanId, objectiveId, difficulty: "intermediate", type: "scenario", question: { de: "F", en: "Q" }, explanation: { de: "E", en: "E" }, stale })
      .returning({ id: questions.id });
    await getDb().insert(questionOptions).values([{ questionId: q.id, orderNum: 1, text: { de: "A", en: "A" }, isCorrect: true }, { questionId: q.id, orderNum: 2, text: { de: "B", en: "B" }, isCorrect: false }]);
  }

  beforeAll(async () => {
    const db = getDb();
    userId = await seedUser();
    const [cert] = await db.insert(certifications).values({ slug: `stale-${tag}`, name: `Stale ${tag}`, provider: "T", examName: "T", examVersion: "1", kind: "general" }).returning();
    certId = cert.id;
    const [domain] = await db.insert(domains).values({ certificationId: certId, orderNum: 1, name: "D" }).returning();
    const [a] = await db.insert(objectives).values({ domainId: domain.id, code: `A-${tag}`, title: "Zugriffsrechte", description: "Rechte vergeben und prüfen" }).returning();
    const [b] = await db.insert(objectives).values({ domainId: domain.id, code: `B-${tag}`, title: "Ohne Quelle", description: null }).returning();
    const [c] = await db.insert(objectives).values({ domainId: domain.id, code: `C-${tag}`, title: "Schon aktuell", description: null }).returning();
    [objA, objB, objC] = [a.id, b.id, c.id];

    const [source] = await db
      .insert(certificationSources)
      .values({ certificationId: certId, sourceType: "pdf", title: "Quelle", provider: "T", storageKey: `k-${tag}`, mimeType: "application/pdf", fileSizeBytes: 1, checksum: `c-${tag}`, status: "approved" })
      .returning();
    sourceId = source.id;
    const [p4] = await db.insert(sourceChunks).values({ sourceId, pageNumber: 4, content: "Rechte nach dem Prinzip der geringsten Rechte vergeben.", contentHash: `h4-${tag}` }).returning();
    const [p5] = await db.insert(sourceChunks).values({ sourceId, pageNumber: 5, content: "Änderungen an Rechten werden protokolliert.", contentHash: `h5-${tag}` }).returning();
    chunkP4 = p4.id;
    await db.insert(objectiveSourceRefs).values([
      { objectiveId: objA, sourceChunkId: p4.id, locator: "S. 4" },
      { objectiveId: objA, sourceChunkId: p5.id, locator: "S. 5" },
      { objectiveId: objC, sourceChunkId: p4.id, locator: "S. 4" },
    ]);

    // Lernziel A: erste Lektion veraltet, zweite aktuell, alle drei Fragen veraltet.
    const [s1] = await db.insert(sections).values({ objectiveId: objA, orderNum: 1, title: { de: "Eins", en: "One" }, estimatedMinutes: 10, difficulty: "beginner" }).returning();
    const [s2] = await db.insert(sections).values({ objectiveId: objA, orderNum: 2, title: { de: "Zwei", en: "Two" }, estimatedMinutes: 10, difficulty: "beginner" }).returning();
    [secA1, secA2] = [s1.id, s2.id];
    await db.insert(lessons).values({ sectionId: secA1, content: OLD_TEXT, keyTakeaways: { de: ["a"], en: ["a"] }, examFocusPoints: { de: ["b"], en: ["b"] }, reviewStatus: "stale" });
    await db.insert(lessons).values({ sectionId: secA2, content: { de: "Aktueller Text der zweiten Lektion.", en: "Current text of the second lesson." }, keyTakeaways: { de: ["a"], en: ["a"] }, examFocusPoints: { de: ["b"], en: ["b"] }, reviewStatus: "grounded" });
    for (let i = 1; i <= 3; i++) await addQuestion(objA, `STALE-${tag}-A-${i}`, true);

    // Lernziel B: eine Gliederung ohne Lektion, aber keine Quelle.
    await db.insert(sections).values({ objectiveId: objB, orderNum: 1, title: { de: "Ohne", en: "Without" }, estimatedMinutes: 10, difficulty: "beginner" });

    // Lernziel C: durchgehend aktuell (Lektion und genug Fragen), mit Quelle.
    const [s3] = await db.insert(sections).values({ objectiveId: objC, orderNum: 1, title: { de: "Drei", en: "Three" }, estimatedMinutes: 10, difficulty: "beginner" }).returning();
    await db.insert(lessons).values({ sectionId: s3.id, content: { de: "Fertig.", en: "Done." }, keyTakeaways: { de: ["a"], en: ["a"] }, examFocusPoints: { de: ["b"], en: ["b"] }, reviewStatus: "grounded" });
    for (let i = 1; i <= MIN_CURRENT_QUESTIONS; i++) await addQuestion(objC, `STALE-${tag}-C-${i}`, false);
  });

  afterAll(async () => {
    await getDb().delete(aiCostEntries).where(eq(aiCostEntries.certificationId, certId));
    await getDb().delete(certifications).where(eq(certifications.id, certId));
    await getDb().delete(users).where(eq(users.id, userId));
  });

  const generator: RegenerationGenerator = async () => ({
    lessons: [draftLesson(1, "Zugriffsrechte neu"), draftLesson(2, "Darf nicht übernommen werden")],
    questions: [
      draftQuestion(1),
      draftQuestion(2, { sourceLocator: "S. 99" }), // Locator, den es nicht gibt: verwerfen
      draftQuestion(3, { grounded: false }), // nicht belegt: verwerfen
      draftQuestion(4, { sourceLocator: "S. 5" }),
      draftQuestion(5),
      draftQuestion(6),
      draftQuestion(7),
      draftQuestion(8),
    ],
  });

  it("schätzt nur Lernziele, die Arbeit haben UND eine Quelle", async () => {
    const estimate = await estimateBatch("stale", certId);
    expect(estimate.items).toBe(1);
    expect(estimate.courses).toBe(1);
  });

  it("ersetzt die veraltete Lektion, lässt die aktuelle in Ruhe und hält die alte als Revision fest", async () => {
    const before2 = await lessonOf(secA2);
    const before1 = await lessonOf(secA1);

    // Der gefälschte Generator bucht wie der echte KI-Aufruf (lib/ai/generate.ts) einen Aufruf; wem er im Kostenbuch gehört, bestimmt der Lauf.
    const metered: RegenerationGenerator = async (...args) => {
      await recordAiUsage({ model: "gemini-3.8-flash", promptTokens: 1_000_000, completionTokens: 0 });
      return generator(...args);
    };
    const { runId } = await startBatch({ kind: "stale", certificationId: certId, userId }, { regenerationGenerator: metered });
    await awaitBatch(runId);
    const booked = await getDb().select().from(aiCostEntries).where(eq(aiCostEntries.certificationId, certId));
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ source: "batch", detail: "stale", byok: false, historic: false });
    expect(Number(booked[0].costUsd)).toBeCloseTo(0.75, 6);
    const status = await getBatchStatus("stale", certId);
    // Eins übernommen (Lernziel A); B hat keine Quelle und zählt als übersprungen; C war aktuell.
    expect(status).toMatchObject({ status: "done", total: 1, applied: 1, skipped: 1, failed: 0 });

    const after1 = await lessonOf(secA1);
    expect(after1.content.de).toContain("Zugriffsrechte neu (de)");
    expect(after1.reviewStatus).toBe("grounded");
    expect(after1.sourceVersionId).toBe(sourceId);
    expect(after1.promptVersion).toBe("v2-grounded");
    expect(after1.version).toBe(before1.version + 1);

    const after2 = await lessonOf(secA2);
    expect(after2.content).toEqual(before2.content);
    expect(after2.version).toBe(before2.version);

    const revisions = await getDb().select().from(contentRevisions).where(and(eq(contentRevisions.targetId, secA1), eq(contentRevisions.certificationId, certId)));
    expect(revisions.some((r) => r.origin === "ai" && JSON.stringify(r.data).includes("Alter Text der veralteten Lektion."))).toBe(true);
  });

  it("legt neue Fragen mit Herkunft an, bis genug aktuelle da sind, und verwirft Unbelegtes", async () => {
    const current = await currentQuestions(objA);
    expect(current).toHaveLength(MIN_CURRENT_QUESTIONS);
    expect(current.every((q) => q.sourceChunkId !== null && /^S\. [45]$/.test(q.sourceReference ?? ""))).toBe(true);
    expect(current.some((q) => q.sourceReference === "S. 5")).toBe(true);
    expect(current.find((q) => q.sourceReference === "S. 4")?.sourceChunkId).toBe(chunkP4);
    // Weder der erfundene Locator noch die unbelegte Frage wurden gespeichert.
    const all = await getDb().select().from(questions).where(eq(questions.objectiveId, objA));
    expect(all.some((q) => q.sourceReference === "S. 99")).toBe(false);
    // Die veralteten Fragen bleiben stehen und veraltet (Antworten der Lernenden verweisen darauf).
    expect(all.filter((q) => q.stale)).toHaveLength(3);
    // Jede neue Frage hat ihre vier Antwortoptionen, genau eine richtig.
    for (const q of current) {
      const options = await getDb().select().from(questionOptions).where(eq(questionOptions.questionId, q.id));
      expect(options).toHaveLength(4);
      expect(options.filter((o) => o.isCorrect)).toHaveLength(1);
    }
  });

  it("fasst Lernziele ohne Quelle und aktuelle nicht an", async () => {
    expect(await currentQuestions(objB)).toHaveLength(0);
    expect(await getDb().select().from(lessons).innerJoin(sections, eq(sections.id, lessons.sectionId)).where(eq(sections.objectiveId, objB))).toHaveLength(0);
    expect(await currentQuestions(objC)).toHaveLength(MIN_CURRENT_QUESTIONS);
  });

  it("danach gibt es nichts mehr zu tun", async () => {
    await expect(startBatch({ kind: "stale", certificationId: certId, userId }, { regenerationGenerator: generator })).rejects.toBeInstanceOf(BatchNothingToDoError);
  });

  describe("direkter Aufruf", () => {
    let certId2 = "";
    let objectiveId = "";
    let sectionId = "";

    beforeAll(async () => {
      const db = getDb();
      const t = randomUUID().slice(0, 8);
      const [cert] = await db.insert(certifications).values({ slug: `stale2-${t}`, name: `Stale2 ${t}`, provider: "T", examName: "T", examVersion: "1", kind: "general" }).returning();
      certId2 = cert.id;
      const [domain] = await db.insert(domains).values({ certificationId: certId2, orderNum: 1, name: "D" }).returning();
      const [obj] = await db.insert(objectives).values({ domainId: domain.id, code: `X-${t}`, title: "Ziel", description: null }).returning();
      objectiveId = obj.id;
      const [src] = await db.insert(certificationSources).values({ certificationId: certId2, sourceType: "pdf", title: "Q", provider: "T", storageKey: `k2-${t}`, mimeType: "application/pdf", fileSizeBytes: 1, checksum: `c2-${t}`, status: "approved" }).returning();
      const [chunk] = await db.insert(sourceChunks).values({ sourceId: src.id, pageNumber: 4, content: "Text", contentHash: `h-${t}` }).returning();
      await db.insert(objectiveSourceRefs).values({ objectiveId, sourceChunkId: chunk.id, locator: "S. 4" });
      const [section] = await db.insert(sections).values({ objectiveId, orderNum: 1, title: { de: "Eins", en: "One" }, estimatedMinutes: 10, difficulty: "beginner" }).returning();
      sectionId = section.id;
      await db.insert(lessons).values({ sectionId, content: OLD_TEXT, keyTakeaways: { de: ["a"], en: ["a"] }, examFocusPoints: { de: ["b"], en: ["b"] }, reviewStatus: "stale" });
    });
    afterAll(async () => {
      await getDb().delete(certifications).where(eq(certifications.id, certId2));
    });

    it("ersetzt keine Lektion, die seit dem Laden von Hand geändert wurde", async () => {
      const handEdited = { de: "Von Hand überarbeitet.", en: "Edited by hand." };
      // Während die KI arbeitet, speichert jemand in der Werkstatt dieselbe Lektion.
      const racing: RegenerationGenerator = async (input, onUsage) => {
        await getDb().update(lessons).set({ content: handEdited, version: 2 }).where(eq(lessons.sectionId, sectionId));
        return generator(input, onUsage);
      };
      const counts = await regenerateStaleContent({ id: certId2, name: "Stale2" }, racing, { actor: { userId, origin: "ai" } });
      expect((await lessonOf(sectionId)).content).toEqual(handEdited);
      expect((await lessonOf(sectionId)).reviewStatus).toBe("stale");
      expect(counts.lessons).toBe(0);
      // Die Fragen wurden trotzdem ergänzt, das Lernziel zählt als übernommen.
      expect(counts.questions).toBe(MIN_CURRENT_QUESTIONS);
      expect(counts.objectives).toBe(1);
    });

    it("zählt ein Lernziel als fehlgeschlagen, wenn die KI einen Fehler liefert, und bricht nicht ab", async () => {
      const failing: RegenerationGenerator = async () => {
        throw new Error("KI nicht erreichbar");
      };
      // Die Lektion ist (nach dem Test davor) weiter veraltet, es gibt also etwas zu tun.
      const counts = await regenerateStaleContent({ id: certId2, name: "Stale2" }, failing, { actor: { userId, origin: "ai" } });
      expect(counts).toMatchObject({ objectives: 0, failed: 1, aborted: false });
    });
  });
});
