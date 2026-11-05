import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  contentReports,
  contentRevisions,
  courseCheckpoints,
  domains,
  lessons,
  objectives,
  questionOptions,
  questions,
  sections,
  users,
  type ContentRevisionOrigin,
  type ContentRevisionTarget,
} from "@/lib/server/db/schema";
import { validateLearningBlocks } from "@/lib/markdown/validate";
import { fingerprint, normalizeSection, type NewQuestion, type QuestionSnapshot, type SectionSnapshot } from "./snapshots";

/**
 * Kurs-Werkstatt (roadmap3.md, Schritt 1): Lektionen und Fragen eines allgemeinen Kurses im Admin-Panel bearbeiten,
 * mit Versionsgeschichte und gemerkten Kursständen. Grundsätze:
 * - Jede Änderung legt vorher den alten Stand als Revision ab (content_revisions), auch Zurücksetzen selbst.
 * - Gespeichert wird nur, wenn der Editor auf dem aktuellen Stand aufbaut (Fingerabdruck), sonst EditConflictError.
 * - IDs bleiben stabil (Lernfortschritt, Antworten und Meldungen hängen daran); Optionen werden an Ort und Stelle
 *   geändert, nie gelöscht und neu angelegt.
 * - Interne Kurse einer Firma fasst die Werkstatt nicht an (wie die Backfill-Skripte).
 */

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

export class EditorNotFoundError extends Error {}
export class EditConflictError extends Error {
  constructor(public readonly current: string) {
    super("Der Inhalt wurde inzwischen geändert.");
  }
}
export class EditValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join(" "));
  }
}

export type Actor = { userId: string | null; origin: ContentRevisionOrigin; note?: string | null };

/* ------------------------------------------------------------------ Lesen */

/** Allgemeine Kurse sind für Admins und Prüfer bearbeitbar; mit `organizationId` stattdessen nur interne Kurse genau dieser Firma. */
export async function editableCourse(certId: string, organizationId?: string) {
  const [cert] = await getDb()
    .select({ id: certifications.id, slug: certifications.slug, name: certifications.name, kind: certifications.kind, owner: certifications.ownerOrganizationId })
    .from(certifications)
    .where(eq(certifications.id, certId))
    .limit(1);
  const allowed = organizationId ? cert?.kind === "internal" && cert.owner === organizationId : cert?.kind === "general";
  if (!cert || !allowed) throw new EditorNotFoundError("Kurs nicht gefunden.");
  return cert;
}

export async function readSection(exec: Exec, sectionId: string): Promise<SectionSnapshot | null> {
  const [row] = await exec
    .select({
      title: sections.title,
      estimatedMinutes: sections.estimatedMinutes,
      difficulty: sections.difficulty,
      content: lessons.content,
      keyTakeaways: lessons.keyTakeaways,
      examFocusPoints: lessons.examFocusPoints,
      cheatSheet: lessons.cheatSheet,
    })
    .from(sections)
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .where(eq(sections.id, sectionId))
    .limit(1);
  return row ? normalizeSection(row as SectionSnapshot) : null;
}

export async function readQuestion(exec: Exec, questionId: string): Promise<QuestionSnapshot | null> {
  const [q] = await exec
    .select({ question: questions.question, explanation: questions.explanation, difficulty: questions.difficulty, type: questions.type, answerFormat: questions.answerFormat, answerData: questions.answerData })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!q) return null;
  const { answerFormat, answerData, ...base } = q;
  const options = await exec
    .select({ id: questionOptions.id, orderNum: questionOptions.orderNum, text: questionOptions.text, isCorrect: questionOptions.isCorrect, rationale: questionOptions.rationale })
    .from(questionOptions)
    .where(eq(questionOptions.questionId, questionId))
    .orderBy(asc(questionOptions.orderNum));
  // Format und Lösungsdaten nur bei den neuen Formaten: Auswahlfragen behalten ihren bisherigen Fingerabdruck.
  return { ...(base as Omit<QuestionSnapshot, "options" | "format" | "answerData">), options, ...(answerFormat !== "choice" ? { format: answerFormat, answerData: answerData ?? undefined } : {}) };
}

/** Gehört die Section / Frage / das Lernziel zu diesem Kurs? */
async function sectionCert(exec: Exec, sectionId: string) {
  const [r] = await exec
    .select({ certId: domains.certificationId, objectiveId: sections.objectiveId })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(sections.id, sectionId))
    .limit(1);
  return r ?? null;
}
async function questionCert(exec: Exec, questionId: string) {
  const [r] = await exec
    .select({ certId: domains.certificationId, objectiveId: questions.objectiveId })
    .from(questions)
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(questions.id, questionId))
    .limit(1);
  return r ?? null;
}
async function objectiveCert(exec: Exec, objectiveId: string) {
  const [r] = await exec
    .select({ certId: domains.certificationId, code: objectives.code })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  return r ?? null;
}

export type WorkshopTree = Array<{
  id: string;
  name: string;
  objectives: Array<{
    id: string;
    code: string;
    title: string;
    questionCount: number;
    openQuestionReports: number;
    sections: Array<{ id: string; title: { de: string; en: string }; hasSimulation: boolean; hasPractice: boolean; openReports: number; revisions: number }>;
  }>;
}>;

/** Gliederung für die linke Spalte, mit den Hinweisen „Meldungen offen“, „ohne Simulation“ und Anzahl Revisionen. */
export async function getWorkshopTree(certId: string): Promise<WorkshopTree> {
  const db = getDb();
  const doms = await db.select().from(domains).where(eq(domains.certificationId, certId)).orderBy(asc(domains.orderNum));
  if (doms.length === 0) return [];
  const domIds = doms.map((d) => d.id);
  const objs = await db.select().from(objectives).where(inArray(objectives.domainId, domIds)).orderBy(asc(objectives.code));
  const objIds = objs.map((o) => o.id);
  const secs = objIds.length
    ? await db
        .select({ id: sections.id, objectiveId: sections.objectiveId, title: sections.title, orderNum: sections.orderNum, lessonId: lessons.id, content: lessons.content })
        .from(sections)
        .innerJoin(lessons, eq(lessons.sectionId, sections.id))
        .where(inArray(sections.objectiveId, objIds))
        .orderBy(asc(sections.orderNum))
    : [];
  const qCounts = objIds.length
    ? await db.select({ objectiveId: questions.objectiveId, n: count() }).from(questions).where(inArray(questions.objectiveId, objIds)).groupBy(questions.objectiveId)
    : [];
  const reports = await db
    .select({ targetType: contentReports.targetType, targetId: contentReports.targetId, objectiveId: questions.objectiveId, n: count() })
    .from(contentReports)
    .leftJoin(questions, and(eq(contentReports.targetType, "question"), eq(questions.id, contentReports.targetId)))
    .where(eq(contentReports.status, "open"))
    .groupBy(contentReports.targetType, contentReports.targetId, questions.objectiveId);
  const revs = await db
    .select({ targetId: contentRevisions.targetId, n: count() })
    .from(contentRevisions)
    .where(and(eq(contentRevisions.certificationId, certId), eq(contentRevisions.targetType, "section"), sql`${contentRevisions.checkpointId} is null`))
    .groupBy(contentRevisions.targetId);

  const lessonReports = new Map(reports.filter((r) => r.targetType === "lesson").map((r) => [r.targetId, Number(r.n)]));
  const questionReports = new Map<string, number>();
  for (const r of reports) if (r.targetType === "question" && r.objectiveId) questionReports.set(r.objectiveId, (questionReports.get(r.objectiveId) ?? 0) + Number(r.n));
  const revCount = new Map(revs.map((r) => [r.targetId, Number(r.n)]));
  const qCount = new Map(qCounts.map((r) => [r.objectiveId, Number(r.n)]));
  const has = (content: { de: string; en: string }, re: RegExp) => re.test(content.de) || re.test(content.en);

  return doms.map((d) => ({
    id: d.id,
    name: d.name,
    objectives: objs
      .filter((o) => o.domainId === d.id)
      .map((o) => ({
        id: o.id,
        code: o.code,
        title: o.title,
        questionCount: qCount.get(o.id) ?? 0,
        openQuestionReports: questionReports.get(o.id) ?? 0,
        sections: secs
          .filter((s) => s.objectiveId === o.id)
          .map((s) => ({
            id: s.id,
            title: s.title,
            hasSimulation: has(s.content, /^\s*(`{3,}|~{3,})\s*simulation\b/m),
            hasPractice: has(s.content, /^:{3,}\s*practice\b/m),
            openReports: lessonReports.get(s.lessonId) ?? 0,
            revisions: revCount.get(s.id) ?? 0,
          })),
      })),
  }));
}

export async function getSectionForEditor(certId: string, sectionId: string) {
  const db = getDb();
  const owner = await sectionCert(db, sectionId);
  if (!owner || owner.certId !== certId) throw new EditorNotFoundError("Lektion nicht gefunden.");
  const snapshot = (await readSection(db, sectionId))!;
  return { sectionId, objectiveId: owner.objectiveId, snapshot, fingerprint: fingerprint(snapshot) };
}

export async function getObjectiveQuestions(certId: string, objectiveId: string) {
  const db = getDb();
  const owner = await objectiveCert(db, objectiveId);
  if (!owner || owner.certId !== certId) throw new EditorNotFoundError("Lernziel nicht gefunden.");
  const rows = await db.select({ id: questions.id, humanId: questions.humanId }).from(questions).where(eq(questions.objectiveId, objectiveId)).orderBy(asc(questions.humanId));
  const reports = rows.length
    ? await db
        .select({ targetId: contentReports.targetId, n: count() })
        .from(contentReports)
        .where(and(eq(contentReports.targetType, "question"), eq(contentReports.status, "open"), inArray(contentReports.targetId, rows.map((r) => r.id))))
        .groupBy(contentReports.targetId)
    : [];
  const open = new Map(reports.map((r) => [r.targetId, Number(r.n)]));
  return Promise.all(
    rows.map(async (r) => {
      const snapshot = (await readQuestion(db, r.id))!;
      return { id: r.id, humanId: r.humanId, snapshot, fingerprint: fingerprint(snapshot), openReports: open.get(r.id) ?? 0 };
    }),
  );
}

/* ------------------------------------------------------------------ Schreiben */

function lessonProblems(s: SectionSnapshot): string[] {
  const problems: string[] = [];
  for (const lang of ["de", "en"] as const) {
    for (const p of validateLearningBlocks(s.content[lang])) problems.push(`Lerntext (${lang}): ${p}`);
    if (s.cheatSheet) for (const p of validateLearningBlocks(s.cheatSheet[lang])) problems.push(`Merkzettel (${lang}): ${p}`);
  }
  return problems;
}

async function insertRevision(exec: Exec, certId: string, targetType: ContentRevisionTarget, targetId: string, data: SectionSnapshot | QuestionSnapshot, actor: Actor, checkpointId: string | null = null) {
  await exec.insert(contentRevisions).values({ certificationId: certId, targetType, targetId, data, origin: actor.origin, note: actor.note ?? null, authorUserId: actor.userId, checkpointId });
}

async function writeSection(tx: Tx, sectionId: string, s: SectionSnapshot) {
  await tx.update(sections).set({ title: s.title, estimatedMinutes: s.estimatedMinutes, difficulty: s.difficulty }).where(eq(sections.id, sectionId));
  // version+1 und updatedAt: Offline-Pakete richten sich nach lessons.updatedAt.
  await tx
    .update(lessons)
    .set({ content: s.content, keyTakeaways: s.keyTakeaways, examFocusPoints: s.examFocusPoints, cheatSheet: s.cheatSheet, version: sql`${lessons.version} + 1`, updatedAt: sql`now()` })
    .where(eq(lessons.sectionId, sectionId));
}

async function writeQuestion(tx: Tx, questionId: string, q: QuestionSnapshot) {
  await tx
    .update(questions)
    .set({ question: q.question, explanation: q.explanation, difficulty: q.difficulty, type: q.type, ...(q.format ? { answerData: q.answerData ?? null } : {}) })
    .where(eq(questions.id, questionId));
  for (const o of q.options) {
    await tx.update(questionOptions).set({ text: o.text, isCorrect: o.isCorrect, rationale: o.rationale, orderNum: o.orderNum }).where(and(eq(questionOptions.id, o.id), eq(questionOptions.questionId, questionId)));
  }
}

/** Zeile sperren, damit zwei gleichzeitige Speichervorgänge nacheinander laufen und der zweite den Konflikt sieht. */
async function lockSection(tx: Tx, sectionId: string) {
  await tx.execute(sql`select 1 from ${lessons} where ${lessons.sectionId} = ${sectionId} for update`);
}
async function lockQuestion(tx: Tx, questionId: string) {
  await tx.execute(sql`select 1 from ${questions} where ${questions.id} = ${questionId} for update`);
}

export async function saveSection(certId: string, sectionId: string, next: SectionSnapshot, baseFingerprint: string, actor: Actor) {
  const normalized = normalizeSection(next);
  const problems = lessonProblems(normalized);
  if (problems.length) throw new EditValidationError(problems);
  return getDb().transaction(async (tx) => {
    const owner = await sectionCert(tx, sectionId);
    if (!owner || owner.certId !== certId) throw new EditorNotFoundError("Lektion nicht gefunden.");
    await lockSection(tx, sectionId);
    const current = (await readSection(tx, sectionId))!;
    const currentFp = fingerprint(current);
    if (currentFp !== baseFingerprint) throw new EditConflictError(currentFp);
    if (fingerprint(normalized) === currentFp) return { fingerprint: currentFp, changed: false };
    await insertRevision(tx, certId, "section", sectionId, current, actor);
    await writeSection(tx, sectionId, normalized);
    return { fingerprint: fingerprint(normalized), changed: true };
  });
}

export async function saveQuestion(certId: string, questionId: string, next: QuestionSnapshot, baseFingerprint: string, actor: Actor) {
  return getDb().transaction(async (tx) => {
    const owner = await questionCert(tx, questionId);
    if (!owner || owner.certId !== certId) throw new EditorNotFoundError("Frage nicht gefunden.");
    await lockQuestion(tx, questionId);
    const current = (await readQuestion(tx, questionId))!;
    const currentFp = fingerprint(current);
    if (currentFp !== baseFingerprint) throw new EditConflictError(currentFp);
    // Optionen werden nur geändert, nicht ersetzt: dieselben IDs wie bisher.
    const ids = new Set(current.options.map((o) => o.id));
    if (next.options.length !== ids.size || next.options.some((o) => !ids.has(o.id))) throw new EditValidationError(["Antwortoptionen passen nicht zur Frage."]);
    if (next.format !== current.format) throw new EditValidationError(["Das Antwortformat einer Frage lässt sich nicht ändern; lege dafür eine neue Frage an."]);
    if (fingerprint(next) === currentFp) return { fingerprint: currentFp, changed: false };
    await insertRevision(tx, certId, "question", questionId, current, actor);
    await writeQuestion(tx, questionId, next);
    return { fingerprint: fingerprint(next), changed: true };
  });
}

/**
 * Lektion löschen (mit Lektionstext, Merkzettel, Simulationen und dem Lernstand dazu). Der letzte Stand bleibt als Version
 * erhalten, damit sich der Inhalt notfalls aus der Versionsgeschichte holen lässt.
 */
export async function deleteSection(certId: string, sectionId: string, actor: Actor) {
  return getDb().transaction(async (tx) => {
    const owner = await sectionCert(tx, sectionId);
    if (!owner || owner.certId !== certId) throw new EditorNotFoundError("Lektion nicht gefunden.");
    await lockSection(tx, sectionId);
    const current = await readSection(tx, sectionId);
    if (current) await insertRevision(tx, certId, "section", sectionId, current, { ...actor, note: "Vor dem Löschen der Lektion" });
    await tx.delete(sections).where(eq(sections.id, sectionId));
    return { sectionId, objectiveId: owner.objectiveId };
  });
}

/** Neue Lektion am Ende des Lernziels. Erst mit fertigem Inhalt angelegt: Lernende sehen nie eine leere Lektion. */
export async function createSection(certId: string, objectiveId: string, s: SectionSnapshot, actor: Actor) {
  const normalized = normalizeSection(s);
  const problems = lessonProblems(normalized);
  if (problems.length) throw new EditValidationError(problems);
  return getDb().transaction(async (tx) => {
    const owner = await objectiveCert(tx, objectiveId);
    if (!owner || owner.certId !== certId) throw new EditorNotFoundError("Lernziel nicht gefunden.");
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${sections.orderNum}), 0)` }).from(sections).where(eq(sections.objectiveId, objectiveId));
    const [sec] = await tx
      .insert(sections)
      .values({ objectiveId, orderNum: Number(max) + 1, title: normalized.title, estimatedMinutes: normalized.estimatedMinutes, difficulty: normalized.difficulty })
      .returning({ id: sections.id });
    await tx.insert(lessons).values({
      sectionId: sec.id,
      content: normalized.content,
      keyTakeaways: normalized.keyTakeaways,
      examFocusPoints: normalized.examFocusPoints,
      cheatSheet: normalized.cheatSheet,
      modelVersion: actor.origin === "ai" ? "ai-edit" : "manual",
    });
    return { sectionId: sec.id, fingerprint: fingerprint(normalized) };
  });
}

/** Frage-ID im Schema der Geschwister („SEC-1.2-Q007“), sonst aus der Kurs-ID; nächste freie Nummer. */
export async function nextHumanId(tx: Tx, certId: string, objectiveId: string, code: string): Promise<string> {
  const siblings = await tx.select({ humanId: questions.humanId }).from(questions).where(eq(questions.objectiveId, objectiveId));
  const m = siblings.map((s) => /^(.*)-Q(\d+)$/.exec(s.humanId)).find(Boolean);
  const prefix = m ? m[1] : `E${certId.replace(/-/g, "").slice(0, 8).toUpperCase()}-${code}`;
  const width = m ? m[2].length : 3;
  let n = siblings.length + 1;
  for (let tries = 0; tries < 1000; tries++, n++) {
    const candidate = `${prefix}-Q${String(n).padStart(width, "0")}`;
    const [taken] = await tx.select({ id: questions.id }).from(questions).where(eq(questions.humanId, candidate)).limit(1);
    if (!taken) return candidate;
  }
  return `${prefix}-Q${Date.now()}`;
}

/** Herkunft einer quellengebundenen Frage: der Locator („S. 4“) und der Textausschnitt, der sie belegt. */
export type QuestionProvenance = { sourceReference: string | null; sourceChunkId: string | null };

export async function createQuestion(certId: string, objectiveId: string, q: NewQuestion, provenance?: QuestionProvenance) {
  return getDb().transaction(async (tx) => {
    const owner = await objectiveCert(tx, objectiveId);
    if (!owner || owner.certId !== certId) throw new EditorNotFoundError("Lernziel nicht gefunden.");
    const humanId = await nextHumanId(tx, certId, objectiveId, owner.code);
    const [row] = await tx
      .insert(questions)
      .values({ humanId, objectiveId, difficulty: q.difficulty, type: q.type, question: q.question, explanation: q.explanation, ...(provenance ? { sourceReference: provenance.sourceReference, sourceChunkId: provenance.sourceChunkId } : {}), ...(q.format ? { answerFormat: q.format, answerData: q.answerData } : {}) })
      .returning({ id: questions.id });
    if (q.options.length > 0) await tx.insert(questionOptions).values(q.options.map((o, i) => ({ questionId: row.id, orderNum: i + 1, text: o.text, isCorrect: o.isCorrect, rationale: o.rationale })));
    const snapshot = (await readQuestion(tx, row.id))!;
    return { questionId: row.id, humanId, fingerprint: fingerprint(snapshot) };
  });
}

/** Reihenfolge der Lektionen eines Lernziels; es müssen genau dessen Lektionen sein. */
export async function reorderSections(certId: string, objectiveId: string, orderedIds: string[]) {
  return getDb().transaction(async (tx) => {
    const owner = await objectiveCert(tx, objectiveId);
    if (!owner || owner.certId !== certId) throw new EditorNotFoundError("Lernziel nicht gefunden.");
    const existing = await tx.select({ id: sections.id }).from(sections).where(eq(sections.objectiveId, objectiveId));
    const ids = new Set(existing.map((e) => e.id));
    if (orderedIds.length !== ids.size || new Set(orderedIds).size !== ids.size || orderedIds.some((id) => !ids.has(id))) {
      throw new EditValidationError(["Die Reihenfolge muss genau die Lektionen dieses Lernziels enthalten."]);
    }
    for (const [i, id] of orderedIds.entries()) await tx.update(sections).set({ orderNum: i + 1 }).where(eq(sections.id, id));
  });
}

/* ------------------------------------------------------------------ Revisionen */

/**
 * Für Skripte und Läufe außerhalb des Editors (Backfill, Übersetzung, später KI): alten Stand einer Lektion bzw. Frage
 * als Revision ablegen, bevor sie ihn überschreiben. Gibt es das Ziel nicht (mehr), passiert nichts.
 */
export async function recordSectionRevision(exec: Exec, certId: string, sectionId: string, actor: Actor) {
  const current = await readSection(exec, sectionId);
  if (current) await insertRevision(exec, certId, "section", sectionId, current, actor);
}
export async function recordQuestionRevision(exec: Exec, certId: string, questionId: string, actor: Actor) {
  const current = await readQuestion(exec, questionId);
  if (current) await insertRevision(exec, certId, "question", questionId, current, actor);
}

/**
 * Lerntext einer Lektion durch ein Skript ersetzen (Backfills): nur, wenn er noch `expected` ist, und mit dem alten
 * Stand als Revision. false = inzwischen geändert, nichts geschrieben.
 */
export async function replaceLessonContent(certId: string, sectionId: string, expected: { de: string; en: string }, next: { de: string; en: string }, actor: Actor): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    await lockSection(tx, sectionId);
    const current = await readSection(tx, sectionId);
    if (!current || current.content.de !== expected.de || current.content.en !== expected.en) return false;
    await insertRevision(tx, certId, "section", sectionId, current, actor);
    await tx.update(lessons).set({ content: next, version: sql`${lessons.version} + 1`, updatedAt: sql`now()` }).where(eq(lessons.sectionId, sectionId));
    return true;
  });
}

export async function listRevisions(certId: string, targetType: ContentRevisionTarget, targetId: string) {
  return getDb()
    .select({
      id: contentRevisions.id,
      origin: contentRevisions.origin,
      note: contentRevisions.note,
      createdAt: contentRevisions.createdAt,
      author: users.name,
      authorEmail: users.email,
      checkpointName: courseCheckpoints.name,
      data: contentRevisions.data,
    })
    .from(contentRevisions)
    .leftJoin(users, eq(users.id, contentRevisions.authorUserId))
    .leftJoin(courseCheckpoints, eq(courseCheckpoints.id, contentRevisions.checkpointId))
    .where(and(eq(contentRevisions.certificationId, certId), eq(contentRevisions.targetType, targetType), eq(contentRevisions.targetId, targetId)))
    .orderBy(desc(contentRevisions.createdAt))
    .limit(100);
}

/** Stand einer Revision zurückschreiben; der aktuelle wird vorher selbst zur Revision. */
async function applyRevisionData(tx: Tx, certId: string, targetType: ContentRevisionTarget, targetId: string, data: unknown, actor: Actor): Promise<"restored" | "unchanged" | "missing"> {
  if (targetType === "section") {
    const owner = await sectionCert(tx, targetId);
    if (!owner || owner.certId !== certId) return "missing";
    await lockSection(tx, targetId);
    const current = (await readSection(tx, targetId))!;
    const target = normalizeSection(data as SectionSnapshot);
    if (fingerprint(current) === fingerprint(target)) return "unchanged";
    await insertRevision(tx, certId, "section", targetId, current, actor);
    await writeSection(tx, targetId, target);
    return "restored";
  }
  const owner = await questionCert(tx, targetId);
  if (!owner || owner.certId !== certId) return "missing";
  await lockQuestion(tx, targetId);
  const current = (await readQuestion(tx, targetId))!;
  const stored = data as QuestionSnapshot;
  // Nur Optionen, die es noch gibt; eine Frage, bei der danach keine richtige Option übrig bliebe, bleibt unverändert.
  const target = { ...stored, options: current.options.map((o) => stored.options.find((s) => s.id === o.id) ?? o) };
  if (target.options.filter((o) => o.isCorrect).length !== 1) return "unchanged";
  if (fingerprint(current) === fingerprint(target)) return "unchanged";
  await insertRevision(tx, certId, "question", targetId, current, actor);
  await writeQuestion(tx, targetId, target);
  return "restored";
}

export async function restoreRevision(certId: string, revisionId: string, userId: string | null) {
  return getDb().transaction(async (tx) => {
    const [rev] = await tx.select().from(contentRevisions).where(and(eq(contentRevisions.id, revisionId), eq(contentRevisions.certificationId, certId))).limit(1);
    if (!rev) throw new EditorNotFoundError("Revision nicht gefunden.");
    const when = rev.createdAt.toISOString().slice(0, 16).replace("T", " ");
    const result = await applyRevisionData(tx, certId, rev.targetType, rev.targetId, rev.data, { userId, origin: "restore", note: `Vor dem Zurücksetzen auf den Stand vom ${when} UTC` });
    if (result === "missing") throw new EditorNotFoundError("Den Inhalt gibt es nicht mehr.");
    return result;
  });
}

/* ------------------------------------------------------------------ Gemerkte Kursstände */

export async function createCheckpoint(certId: string, name: string, userId: string | null) {
  return getDb().transaction(async (tx) => {
    const [cp] = await tx.insert(courseCheckpoints).values({ certificationId: certId, name, createdByUserId: userId }).returning({ id: courseCheckpoints.id });
    const secIds = await tx
      .select({ id: sections.id })
      .from(sections)
      .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(eq(domains.certificationId, certId));
    const qIds = await tx
      .select({ id: questions.id })
      .from(questions)
      .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(eq(domains.certificationId, certId));
    const actor: Actor = { userId, origin: "checkpoint", note: name };
    for (const s of secIds) {
      const snap = await readSection(tx, s.id);
      if (snap) await insertRevision(tx, certId, "section", s.id, snap, actor, cp.id);
    }
    for (const q of qIds) {
      const snap = await readQuestion(tx, q.id);
      if (snap) await insertRevision(tx, certId, "question", q.id, snap, actor, cp.id);
    }
    return { id: cp.id, sections: secIds.length, questions: qIds.length };
  });
}

export async function listCheckpoints(certId: string) {
  return getDb()
    .select({ id: courseCheckpoints.id, name: courseCheckpoints.name, createdAt: courseCheckpoints.createdAt, author: users.name, authorEmail: users.email, items: count(contentRevisions.id) })
    .from(courseCheckpoints)
    .leftJoin(users, eq(users.id, courseCheckpoints.createdByUserId))
    .leftJoin(contentRevisions, eq(contentRevisions.checkpointId, courseCheckpoints.id))
    .where(eq(courseCheckpoints.certificationId, certId))
    .groupBy(courseCheckpoints.id, users.name, users.email)
    .orderBy(desc(courseCheckpoints.createdAt));
}

/**
 * Ganzen Kurs auf einen gemerkten Stand zurücksetzen. Lektionen und Fragen, die es inzwischen nicht mehr gibt, bleiben
 * weg; neu hinzugekommene bleiben (Strukturänderungen setzt Schritt 1 nicht zurück, das melden die Zahlen).
 */
export async function restoreCheckpoint(certId: string, checkpointId: string, userId: string | null) {
  return getDb().transaction(async (tx) => {
    const [cp] = await tx.select().from(courseCheckpoints).where(and(eq(courseCheckpoints.id, checkpointId), eq(courseCheckpoints.certificationId, certId))).limit(1);
    if (!cp) throw new EditorNotFoundError("Gemerkter Stand nicht gefunden.");
    const rows = await tx.select().from(contentRevisions).where(eq(contentRevisions.checkpointId, checkpointId));
    const counts = { restored: 0, unchanged: 0, missing: 0 };
    const actor: Actor = { userId, origin: "restore", note: `Vor dem Zurücksetzen auf „${cp.name}“` };
    for (const r of rows) counts[await applyRevisionData(tx, certId, r.targetType, r.targetId, r.data, actor)]++;
    return counts;
  });
}

