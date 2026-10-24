/** Sammelläufe gegen echte DB, mit gefälschter KI (nur mit TEST_DATABASE_URL). */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { aiBatchRuns, certifications, conceptPrerequisites, concepts, contentRevisions, courseCheckpoints, itemVariants, lessons, objectiveExplanations, questionOptions, questions, users } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { awaitBatch, estimateBatch, BatchAlreadyRunningError, BatchNothingToDoError, cancelBatch, getBatchStatus, startBatch } from "./batch";
import type { Generate } from "./ai";

const run = TEST_DB ? describe : describe.skip;

const SIM = (t: string) => JSON.stringify({ type: "terminal", title: t, scenario: "Zeig die Dateien.", steps: [{ goal: "Alle", accept: ["ls -la"], output: "total 0", hint: "-a" }], success: "ok" });

run("Sammelläufe (echte DB, gefälschte KI)", () => {
  let userId = "";
  let certId = "";
  let sectionIds: string[] = [];

  beforeAll(async () => {
    userId = await seedUser();
    const course = await seedCourse(1);
    certId = course.certId;
    await getDb().update(certifications).set({ kind: "general" }).where(eq(certifications.id, certId));
    sectionIds = await seedLessons(course.objectiveId, ["## Eins\n\nKurzer Text.", "## Zwei\n\nNoch ein Text über Dateien."]);
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("Simulationen: ergänzt, wo es passt, überspringt Ungeeignetes, zählt mit", async () => {
    let calls = 0;
    const { runId } = await startBatch(
      { kind: "simulations", certificationId: certId, userId },
      { simulationGenerator: async () => (++calls === 1 ? { afterHeading: "", de: SIM("Dateien"), en: SIM("Files") } : null) },
    );
    await awaitBatch(runId);
    const status = await getBatchStatus("simulations", certId);
    expect(status).toMatchObject({ status: "done", total: 2, processed: 2, applied: 1, skipped: 1, failed: 0 });
    const rows = await getDb().select({ content: lessons.content }).from(lessons);
    expect(rows.filter((r) => r.content.de.includes("```simulation") || r.content.de.includes("````simulation")).length).toBeGreaterThanOrEqual(1);
    // Version mit Herkunft „Nachtrag“
    const revs = await getDb().select().from(contentRevisions).where(eq(contentRevisions.certificationId, certId));
    expect(revs.some((r) => r.origin === "backfill")).toBe(true);
  });

  it("zweiter Start: nur noch, was ungeeignet war; läuft einer, gibt es 409", async () => {
    const { runId } = await startBatch({ kind: "simulations", certificationId: certId, userId }, { simulationGenerator: async () => (await new Promise((r) => setTimeout(r, 150)), null) });
    await expect(startBatch({ kind: "simulations", certificationId: certId, userId }, { simulationGenerator: async () => null })).rejects.toBeInstanceOf(BatchAlreadyRunningError);
    await awaitBatch(runId);
    expect((await getBatchStatus("simulations", certId))?.status).toBe("done");
  });

  it("Qualitätsbericht: bearbeitet die Punkte, übernimmt, merkt vorher den Kursstand", async () => {
    const generate: Generate = async (_system, _user, schema) => {
      const candidate = {
        title: "Lektion neu", content: `## Eins\n\n${"Ausführlicher Text. ".repeat(40)}\n\n> [!EXAM]\n> Das wird geprüft.`,
        keyTakeaways: ["Merke"], examFocusPoints: ["Fokus"], cheatSheet: null, changes: "erweitert",
      };
      return schema.parse(candidate);
    };
    const { runId } = await startBatch({ kind: "quality", certificationId: certId, userId, params: { kinds: ["thin_lesson", "no_exam_callout"], maxItems: 10 } }, { generate });
    await awaitBatch(runId);
    const status = await getBatchStatus("quality", certId);
    expect(status?.status).toBe("done");
    expect(status!.applied).toBeGreaterThan(0);
    const rows = await getDb().select({ content: lessons.content }).from(lessons);
    expect(rows.some((r) => r.content.de.includes("Ausführlicher Text"))).toBe(true);
    const revs = await getDb().select().from(contentRevisions).where(eq(contentRevisions.certificationId, certId));
    expect(revs.some((r) => r.origin === "ai")).toBe(true);
    const cps = await getDb().select().from(courseCheckpoints).where(eq(courseCheckpoints.certificationId, certId));
    expect(cps.some((c) => c.name.startsWith("Automatisch vor KI-Überarbeitung"))).toBe(true);
    expect(sectionIds.length).toBe(2);
  });

  it("nichts zu tun → 422-Fall; Abbrechen eines nicht laufenden Laufs ist wirkungslos", async () => {
    await expect(startBatch({ kind: "quality", certificationId: certId, userId, params: { kinds: ["missing_objective"] } }, { generate: async (_s, _u, schema) => schema.parse({}) })).rejects.toBeInstanceOf(BatchNothingToDoError);
    expect(await cancelBatch("simulations", certId)).toBe(false);
  });

  it("Lauf ohne aktiven Prozess gilt nach Neustart als abgebrochen", async () => {
    const [ghost] = await getDb().insert(aiBatchRuns).values({ kind: "concepts", certificationId: certId, total: 3 }).returning();
    const status = await getBatchStatus("concepts", certId);
    expect(status).toMatchObject({ id: ghost.id, status: "failed" });
    expect(status?.message).toContain("neu gestartet");
  });
});

run("Sammelläufe: Varianten, Erklärungen, Voraussetzungen, Formatfragen (echte DB, gefälschte KI)", () => {
  let userId = "";
  let certId = "";
  let objectiveId = "";
  let questionId = "";

  beforeAll(async () => {
    userId = await seedUser();
    const course = await seedCourse(1);
    certId = course.certId;
    objectiveId = course.objectiveId;
    questionId = course.questionIds[0];
    await getDb().update(certifications).set({ kind: "general" }).where(eq(certifications.id, certId));
    await seedLessons(objectiveId, ["## Partitionen\n\nEine Festplatte wird in Partitionen aufgeteilt, damit mehrere Systeme nebeneinander laufen."]);
    await getDb().update(questions).set({ question: { de: "Wofür dient eine Partition?", en: "What is a partition for?" }, explanation: { de: "Sie teilt den Datenträger.", en: "It divides the disk." } }).where(eq(questions.id, questionId));
    await getDb().insert(questionOptions).values([
      { questionId, orderNum: 1, text: { de: "Datenträger unterteilen", en: "Divide the disk" }, isCorrect: true },
      { questionId, orderNum: 2, text: { de: "Daten verschlüsseln", en: "Encrypt data" }, isCorrect: false },
    ]);
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("Varianten: ergänzt je Frage zwei, danach gibt es nichts mehr zu tun", async () => {
    const topics = [
      { de: "Ein Admin richtet einen Server für zwei Betriebssysteme ein: Welche Maßnahme trennt die Platte logisch in Bereiche?", en: "An admin prepares a server for two operating systems: which measure logically splits the drive into areas?" },
      { de: "Im Notebook einer Kollegin sollen Programme und Dokumente getrennt liegen. Was legt man dafür auf dem Laufwerk an?", en: "On a colleague's notebook programs and documents should live apart. What do you create on the drive for that?" },
    ];
    const variant = (n: number) => ({
      question: topics[(n - 1) % 2],
      options: [
        { text: { de: `Bereich ${n} anlegen`, en: `Create area ${n}` }, isCorrect: true },
        { text: { de: "Alles löschen", en: "Delete everything" }, isCorrect: false },
        { text: { de: "Neu starten", en: "Reboot" }, isCorrect: false },
        { text: { de: "Passwort ändern", en: "Change password" }, isCorrect: false },
      ],
      explanation: { de: "Bereiche entstehen durch Aufteilen.", en: "Areas arise from splitting." },
    });
    let n = 0;
    const { runId } = await startBatch({ kind: "variants", certificationId: certId, userId }, { variantGenerator: async (_s, count) => Array.from({ length: count }, () => variant(++n)) });
    await awaitBatch(runId);
    expect(await getBatchStatus("variants", certId)).toMatchObject({ status: "done", total: 1, applied: 1, failed: 0 });
    const extras = await getDb().select().from(itemVariants).where(eq(itemVariants.itemId, questionId));
    expect(extras.length).toBeGreaterThanOrEqual(2);
    await expect(startBatch({ kind: "variants", certificationId: certId, userId }, { variantGenerator: async () => [] })).rejects.toBeInstanceOf(BatchNothingToDoError);
  });

  it("Erklärungen: legt Entwürfe an, nie freigegeben", async () => {
    const text = (t: string) => ({ de: `${t} `.repeat(30), en: `${t} `.repeat(30) });
    const { runId } = await startBatch(
      { kind: "explanations", certificationId: certId, userId },
      { explanationGenerator: async (_s, kinds) => kinds.map((kind) => ({ kind, content: kind === "gapped_example" ? { de: `Teile ___ ${"Beispiel ".repeat(30)}`, en: `Split ___ ${"example ".repeat(30)}` } : text(`Wie ein Schrank mit Fächern ${kind}`), solution: kind === "gapped_example" ? { de: "die Platte", en: "the disk" } : undefined })) },
    );
    await awaitBatch(runId);
    expect(await getBatchStatus("explanations", certId)).toMatchObject({ status: "done", total: 1, applied: 1 });
    const rows = await getDb().select().from(objectiveExplanations).where(eq(objectiveExplanations.objectiveId, objectiveId));
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "draft")).toBe(true);
  });

  it("Voraussetzungen: braucht Konzepte, legt Entwürfe an, läuft nicht erneut", async () => {
    await expect(startBatch({ kind: "prerequisites", certificationId: certId, userId }, { prerequisiteGenerator: async () => [] })).rejects.toBeInstanceOf(BatchNothingToDoError);
    const [a, b] = await getDb().insert(concepts).values([{ courseId: certId, topicArea: "Platten", name: "Partition" }, { courseId: certId, topicArea: "Platten", name: "Datenträger" }]).returning();
    const { runId } = await startBatch({ kind: "prerequisites", certificationId: certId, userId }, { prerequisiteGenerator: async (list) => [{ concept: list.findIndex((c) => c.id === a.id), requires: [list.findIndex((c) => c.id === b.id)] }] });
    await awaitBatch(runId);
    expect(await getBatchStatus("prerequisites", certId)).toMatchObject({ status: "done", total: 1, failed: 0 });
    const edges = await getDb().select().from(conceptPrerequisites).where(eq(conceptPrerequisites.conceptId, a.id));
    expect(edges).toMatchObject([{ requiresConceptId: b.id, status: "draft" }]);
    await expect(startBatch({ kind: "prerequisites", certificationId: certId, userId }, { prerequisiteGenerator: async () => [] })).rejects.toBeInstanceOf(BatchNothingToDoError);
  });

  it("Formatfragen: ergänzt für Lernziele nur mit Auswahlfragen, danach nicht mehr", async () => {
    expect((await estimateBatch("formats", certId)).items).toBe(1);
    const generate: Generate = async (_system, _user, schema) =>
      schema.parse({
        questions: [
          { format: "ordering", question: "Ordne die Schritte beim Partitionieren.", explanation: "Erst planen, dann anlegen.", difficulty: "intermediate", type: "knowledge", steps: ["Platte wählen", "Tabelle anlegen", "Partition anlegen"], accepted: [], pairs: [] },
          { format: "short_answer", question: "Welcher Befehl listet Partitionen?", explanation: "lsblk zeigt sie.", difficulty: "intermediate", type: "knowledge", steps: [], accepted: ["lsblk"], pairs: [] },
        ],
      });
    const { runId } = await startBatch({ kind: "formats", certificationId: certId, userId }, { generate });
    await awaitBatch(runId);
    expect(await getBatchStatus("formats", certId)).toMatchObject({ status: "done", total: 1, applied: 1, failed: 0 });
    const formats = (await getDb().select({ f: questions.answerFormat }).from(questions).where(and(eq(questions.objectiveId, objectiveId), eq(questions.probeOnly, false)))).map((r) => r.f).sort();
    expect(formats).toEqual(["choice", "ordering", "short_answer"]);
    await expect(startBatch({ kind: "formats", certificationId: certId, userId }, { generate })).rejects.toBeInstanceOf(BatchNothingToDoError);
  });
});

run("Sammelläufe: Begründungen, Lernblöcke, „Was damit möglich ist“ (echte DB, gefälschte KI)", () => {
  let userId = "";
  let certId = "";
  let questionId = "";
  let wrongId = "";
  const LESSON = "## Partitionen\n\nEine Festplatte wird in Partitionen aufgeteilt, damit mehrere Systeme nebeneinander laufen können.";

  beforeAll(async () => {
    userId = await seedUser();
    const course = await seedCourse(1);
    certId = course.certId;
    questionId = course.questionIds[0];
    await getDb().update(certifications).set({ kind: "general" }).where(eq(certifications.id, certId));
    await seedLessons(course.objectiveId, [LESSON]);
    const [, wrong] = await getDb()
      .insert(questionOptions)
      .values([
        { questionId, orderNum: 1, text: { de: "Datenträger unterteilen", en: "Divide the disk" }, isCorrect: true },
        { questionId, orderNum: 2, text: { de: "Daten verschlüsseln", en: "Encrypt data" }, isCorrect: false },
      ])
      .returning();
    wrongId = wrong.id;
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("Begründungen: ergänzt die fehlende, überschreibt nichts, danach nichts mehr zu tun", async () => {
    const reason = { de: "Verschlüsseln ist etwas anderes als Aufteilen: dabei bleibt die Größe der Bereiche gleich.", en: "Encrypting is different from splitting: the size of the areas stays the same." };
    const { runId } = await startBatch({ kind: "rationales", certificationId: certId, userId }, { rationaleGenerator: async () => ({ [wrongId]: reason }) });
    await awaitBatch(runId);
    expect(await getBatchStatus("rationales", certId)).toMatchObject({ status: "done", total: 1, applied: 1, failed: 0 });
    const [row] = await getDb().select({ rationale: questionOptions.rationale }).from(questionOptions).where(eq(questionOptions.id, wrongId));
    expect(row.rationale).toEqual(reason);
    await expect(startBatch({ kind: "rationales", certificationId: certId, userId }, { rationaleGenerator: async () => ({}) })).rejects.toBeInstanceOf(BatchNothingToDoError);
  });

  it("Lernblöcke: fügt Blöcke ein, der Text bleibt, danach nichts mehr zu tun", async () => {
    const withBlock = `${LESSON}\n\n> [!NOTE]\n> Vor dem Aufteilen ein Backup anlegen.`;
    const { runId } = await startBatch({ kind: "blocks", certificationId: certId, userId }, { blocksGenerator: async () => ({ de: withBlock, en: withBlock }) });
    await awaitBatch(runId);
    expect(await getBatchStatus("blocks", certId)).toMatchObject({ status: "done", total: 1, applied: 1, failed: 0 });
    const rows = await getDb().select({ content: lessons.content }).from(lessons);
    expect(rows.some((r) => r.content.de.includes("[!NOTE]") && r.content.de.includes("Eine Festplatte wird in Partitionen"))).toBe(true);
    await expect(startBatch({ kind: "blocks", certificationId: certId, userId }, { blocksGenerator: async (l) => l.content })).rejects.toBeInstanceOf(BatchNothingToDoError);
  });

  it("Was damit möglich ist: ergänzt den Hinweis, danach nichts mehr zu tun", async () => {
    const content = `${LESSON}\n\n> [!NOTE]\n> Vor dem Aufteilen ein Backup anlegen.\n\n> [!POSSIBLE]\n> Mit Partitionen betreibst du zwei Systeme auf einem Rechner.`;
    const generate: Generate = async (_system, _user, schema) => schema.parse({ title: "Partitionen", content, keyTakeaways: ["Merke"], examFocusPoints: ["Fokus"], cheatSheet: null, changes: "Hinweis ergänzt" });
    expect((await estimateBatch("possible", certId)).items).toBe(1);
    const { runId } = await startBatch({ kind: "possible", certificationId: certId, userId }, { generate });
    await awaitBatch(runId);
    expect(await getBatchStatus("possible", certId)).toMatchObject({ status: "done", total: 1, applied: 1, failed: 0 });
    const rows = await getDb().select({ content: lessons.content }).from(lessons);
    expect(rows.some((r) => r.content.de.includes("[!POSSIBLE]"))).toBe(true);
    await expect(startBatch({ kind: "possible", certificationId: certId, userId }, { generate })).rejects.toBeInstanceOf(BatchNothingToDoError);
  });
});
