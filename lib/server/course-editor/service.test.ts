/** Kurs-Werkstatt (echte DB nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, contentRevisions, domains, lessons, objectives, organizations, questionOptions, questions, sections } from "@/lib/server/db/schema";
import { fingerprint, questionSnapshotSchema, sectionSnapshotSchema, type SectionSnapshot } from "./snapshots";
import {
  createCheckpoint,
  createQuestion,
  createSection,
  EditConflictError,
  EditorNotFoundError,
  EditValidationError,
  editableCourse,
  getObjectiveQuestions,
  getSectionForEditor,
  getWorkshopTree,
  listRevisions,
  reorderSections,
  replaceLessonContent,
  restoreCheckpoint,
  restoreRevision,
  saveQuestion,
  saveSection,
} from "./service";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);

const section = (content: string): SectionSnapshot => ({
  title: { de: "Titel", en: "Title" },
  estimatedMinutes: 10,
  difficulty: "beginner",
  content: { de: content, en: content },
  keyTakeaways: null,
  examFocusPoints: null,
  cheatSheet: null,
});

describe("Snapshots", () => {
  it("Fingerabdruck hängt nicht an der Reihenfolge der Schlüssel", () => {
    const a = section("x");
    const b = { cheatSheet: null, examFocusPoints: null, keyTakeaways: null, content: { en: "x", de: "x" }, difficulty: "beginner", estimatedMinutes: 10, title: { en: "Title", de: "Titel" } };
    expect(fingerprint(a)).toBe(fingerprint(b as SectionSnapshot));
    expect(fingerprint(a)).not.toBe(fingerprint(section("y")));
  });
  it("Frage braucht genau eine richtige Option, Lektion Text in beiden Sprachen", () => {
    const opt = (isCorrect: boolean) => ({ id: randomUUID(), orderNum: 1, text: { de: "a", en: "a" }, isCorrect, rationale: null });
    const q = { question: { de: "q", en: "q" }, explanation: { de: "e", en: "e" }, difficulty: "beginner", type: "knowledge" };
    expect(questionSnapshotSchema.safeParse({ ...q, options: [opt(true), opt(false)] }).success).toBe(true);
    expect(questionSnapshotSchema.safeParse({ ...q, options: [opt(true), opt(true)] }).success).toBe(false);
    expect(sectionSnapshotSchema.safeParse({ ...section("x"), content: { de: "x", en: " " } }).success).toBe(false);
  });
});

run("Kurs-Werkstatt (echte DB)", () => {
  const certIds: string[] = [];
  const orgIds: string[] = [];
  afterAll(async () => {
    if (certIds.length) await getDb().delete(certifications).where(inArray(certifications.id, certIds));
    if (orgIds.length) await getDb().delete(organizations).where(inArray(organizations.id, orgIds));
  });

  async function mk(kind: "general" | "internal" = "general") {
    const d = getDb();
    let ownerOrganizationId: string | null = null;
    if (kind === "internal") {
      const [org] = await d.insert(organizations).values({ name: `Firma ${tag}` }).returning({ id: organizations.id });
      orgIds.push(org.id);
      ownerOrganizationId = org.id;
    }
    const [c] = await d.insert(certifications).values({ slug: `ws-${certIds.length}-${tag}`, name: "W", provider: "T", examName: "T", examVersion: "1", kind, ownerOrganizationId }).returning({ id: certifications.id });
    certIds.push(c.id);
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
    const [obj] = await d.insert(objectives).values({ domainId: dom.id, code: "1.1", title: "O" }).returning();
    const secIds: string[] = [];
    for (const i of [1, 2]) {
      const [s] = await d.insert(sections).values({ objectiveId: obj.id, orderNum: i, title: { de: `L${i}`, en: `L${i}` } }).returning();
      await d.insert(lessons).values({ sectionId: s.id, content: { de: `Text ${i}`, en: `Text ${i}` } });
      secIds.push(s.id);
    }
    const [q] = await d.insert(questions).values({ humanId: `WS${tag}${certIds.length}-1.1-Q001`, objectiveId: obj.id, difficulty: "beginner", type: "knowledge", question: { de: "Frage?", en: "Question?" }, explanation: { de: "Weil.", en: "Because." } }).returning();
    await d.insert(questionOptions).values([1, 2, 3, 4].map((n) => ({ questionId: q.id, orderNum: n, text: { de: `A${n}`, en: `A${n}` }, isCorrect: n === 1 })));
    return { certId: c.id, objectiveId: obj.id, secIds, questionId: q.id, prefix: `WS${tag}${certIds.length}` };
  }
  const actor = { userId: null, origin: "manual" as const };

  it("nur allgemeine Kurse sind bearbeitbar", async () => {
    const internal = await mk("internal");
    await expect(editableCourse(internal.certId)).rejects.toBeInstanceOf(EditorNotFoundError);
    await expect(editableCourse(randomUUID())).rejects.toBeInstanceOf(EditorNotFoundError);
  });

  it("speichern legt den alten Stand als Revision ab; veralteter Stand → Konflikt; Zurücksetzen stellt wieder her", async () => {
    const { certId, secIds } = await mk();
    const loaded = await getSectionForEditor(certId, secIds[0]);
    const saved = await saveSection(certId, secIds[0], { ...loaded.snapshot, content: { de: "Neu", en: "New" } }, loaded.fingerprint, { ...actor, note: "Test" });
    expect(saved.changed).toBe(true);
    const [lesson] = await getDb().select().from(lessons).where(eq(lessons.sectionId, secIds[0]));
    expect(lesson.content).toEqual({ de: "Neu", en: "New" });
    expect(lesson.version).toBe(2);
    await expect(saveSection(certId, secIds[0], loaded.snapshot, loaded.fingerprint, actor)).rejects.toBeInstanceOf(EditConflictError);

    const revs = await listRevisions(certId, "section", secIds[0]);
    expect(revs).toHaveLength(1);
    expect((revs[0].data as SectionSnapshot).content.de).toBe("Text 1");
    expect(await restoreRevision(certId, revs[0].id, null)).toBe("restored");
    expect((await getSectionForEditor(certId, secIds[0])).snapshot.content.de).toBe("Text 1");
    // Der überschriebene Stand („Neu“) ist selbst zur Revision geworden.
    const after = await listRevisions(certId, "section", secIds[0]);
    expect(after.map((r) => (r.data as SectionSnapshot).content.de)).toEqual(["Neu", "Text 1"]);
  });

  it("fremde IDs und kaputte Lernblöcke werden abgelehnt", async () => {
    const a = await mk();
    const b = await mk();
    const loaded = await getSectionForEditor(a.certId, a.secIds[0]);
    await expect(saveSection(b.certId, a.secIds[0], loaded.snapshot, loaded.fingerprint, actor)).rejects.toBeInstanceOf(EditorNotFoundError);
    await expect(saveSection(a.certId, a.secIds[0], { ...loaded.snapshot, content: { de: ":::steps\n- a | b\n:::", en: "x" } }, loaded.fingerprint, actor)).rejects.toBeInstanceOf(EditValidationError);
  });

  it("Frage: Optionen behalten ihre IDs, fremde Option wird abgelehnt", async () => {
    const { certId, objectiveId, questionId } = await mk();
    const [item] = await getObjectiveQuestions(certId, objectiveId);
    const ids = item.snapshot.options.map((o) => o.id);
    const next = { ...item.snapshot, options: item.snapshot.options.map((o, i) => ({ ...o, isCorrect: i === 2, text: i === 2 ? { de: "Neu richtig", en: "New correct" } : o.text })) };
    await saveQuestion(certId, questionId, next, item.fingerprint, actor);
    const opts = await getDb().select().from(questionOptions).where(eq(questionOptions.questionId, questionId));
    expect(opts.map((o) => o.id).sort()).toEqual([...ids].sort());
    expect(opts.find((o) => o.isCorrect)?.text.de).toBe("Neu richtig");
    const [reloaded] = await getObjectiveQuestions(certId, objectiveId);
    const foreign = { ...reloaded.snapshot, options: [...reloaded.snapshot.options.slice(0, 3), { ...reloaded.snapshot.options[3], id: randomUUID() }] };
    await expect(saveQuestion(certId, questionId, foreign, reloaded.fingerprint, actor)).rejects.toBeInstanceOf(EditValidationError);
  });

  it("neue Lektion und Frage, Reihenfolge", async () => {
    const { certId, objectiveId, secIds, prefix } = await mk();
    const { sectionId } = await createSection(certId, objectiveId, section("## Neu\n\nInhalt"), actor);
    const { humanId } = await createQuestion(certId, objectiveId, {
      question: { de: "Neu?", en: "New?" },
      explanation: { de: "x", en: "x" },
      difficulty: "beginner",
      type: "knowledge",
      options: [0, 1].map((i) => ({ text: { de: `O${i}`, en: `O${i}` }, isCorrect: i === 0, rationale: null })),
    });
    expect(humanId).toBe(`${prefix}-1.1-Q002`);
    await reorderSections(certId, objectiveId, [sectionId, secIds[1], secIds[0]]);
    const tree = await getWorkshopTree(certId);
    expect(tree[0].objectives[0].sections.map((s) => s.id)).toEqual([sectionId, secIds[1], secIds[0]]);
    expect(tree[0].objectives[0].questionCount).toBe(2);
    await expect(reorderSections(certId, objectiveId, [sectionId])).rejects.toBeInstanceOf(EditValidationError);
  });

  it("gemerkter Stand: ganzen Kurs zurücksetzen, inzwischen neue Inhalte bleiben", async () => {
    const { certId, objectiveId, secIds, questionId } = await mk();
    const cp = await createCheckpoint(certId, "vorher", null);
    expect(cp).toMatchObject({ sections: 2, questions: 1 });
    const s = await getSectionForEditor(certId, secIds[1]);
    await saveSection(certId, secIds[1], { ...s.snapshot, content: { de: "geändert", en: "changed" } }, s.fingerprint, actor);
    const [q] = await getObjectiveQuestions(certId, objectiveId);
    await saveQuestion(certId, questionId, { ...q.snapshot, question: { de: "anders?", en: "other?" } }, q.fingerprint, actor);
    await createSection(certId, objectiveId, section("neu"), actor);
    expect(await restoreCheckpoint(certId, cp.id, null)).toEqual({ restored: 2, unchanged: 1, missing: 0 });
    expect((await getSectionForEditor(certId, secIds[1])).snapshot.content.de).toBe("Text 2");
    expect((await getObjectiveQuestions(certId, objectiveId))[0].snapshot.question.de).toBe("Frage?");
    expect((await getWorkshopTree(certId))[0].objectives[0].sections).toHaveLength(3);
  });

  it("Skripte ersetzen Lerntext nur, wenn er unverändert ist, mit Revision", async () => {
    const { certId, secIds } = await mk();
    expect(await replaceLessonContent(certId, secIds[0], { de: "Text 1", en: "Text 1" }, { de: "Neu", en: "Neu" }, { userId: null, origin: "backfill", note: "x" })).toBe(true);
    expect(await replaceLessonContent(certId, secIds[0], { de: "Text 1", en: "Text 1" }, { de: "Nochmal", en: "Nochmal" }, { userId: null, origin: "backfill" })).toBe(false);
    const revs = await getDb().select().from(contentRevisions).where(eq(contentRevisions.targetId, secIds[0]));
    expect(revs).toHaveLength(1);
    expect(revs[0].origin).toBe("backfill");
  });
});
