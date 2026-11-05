/**
 * Sammelläufe der KI-Nachbesserung (nur allgemeine Kurse, nur Admins):
 *  - quality:     alle Verbesserungspunkte des Qualitätsberichts eines Kurses von der KI bearbeiten lassen und direkt übernehmen
 *  - simulations: Simulationen in Lektionen ergänzen, die noch keine haben (ein Kurs oder alle Kurse)
 *  - concepts:    Konzepte und Abfragevarianten (Wiederholungsplanung) ergänzen (ein Kurs oder alle Kurse)
 *  - variants:    Varianten für die Wiederholung (mindestens zwei je Frage) ergänzen
 *  - explanations: Alternativerklärungen für den Verstehens-Modus als Entwurf ergänzen (Freigabe in der Werkstatt)
 *  - prerequisites: Voraussetzungen zwischen den Konzepten als Entwurf vorschlagen (Freigabe in der Werkstatt)
 *  - rationales:  Begründungen je falscher Antwortoption ergänzen
 *  - blocks:      Lernblöcke (Hinweise, Terminal, Praxisbeispiel) in Lektionen ohne Blöcke einfügen
 *  - possible:    „Was damit möglich ist“ und Textverweise in Simulationen ergänzen
 *  - formats:     Formatfragen (Reihenfolge, Kurzantwort, Zuordnung) für Lernziele ergänzen, die nur Auswahlfragen haben
 *  - stale:       veraltete (nach einer neuen Quellenversion) und fehlende Lektionen und Fragen aus der aktuellen Quelle neu erzeugen
 *
 * Die KI-Aktionen sind dieselben wie in der Kurs-Werkstatt; hier werden die Vorschläge ohne Einzelprüfung übernommen. Das
 * Sicherheitsnetz bleibt: vor dem Lauf ein automatisch gemerkter Kursstand, jede Änderung als Version mit Herkunft „KI“ bzw.
 * „Nachtrag“, Kostenschätzung vorab, Budget-Prüfung und Abbruch jederzeit.
 */
import { and, asc, desc, eq, inArray, isNull, ne, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import { LESSONS_MODEL } from "@/lib/gemini";
import { estimateCostUsd, getAiBudgetStatus } from "@/lib/server/admin/ai-cost";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { clientFor } from "@/lib/server/course-translation/service";
import { getDb } from "@/lib/server/db/client";
import { aiBatchRuns, certifications, conceptPrerequisites, concepts, domains, lessons, objectives, questions, sections, type AiBatchKind, type AiBatchStatus } from "@/lib/server/db/schema";
import { backfillExplanations, createExplanationGenerator, estimateRun as estimateExplanations, loadExplanationSources, missingKinds, type ExplanationGenerator } from "@/lib/server/explanations/generate";
import { backfillBlocks, createBlocksGenerator, HAS_BLOCKS, type BlocksGenerator } from "@/lib/server/lessons/blocks-backfill";
import { backfillRationales, createRationaleGenerator, questionsWithoutRationales, type RationaleGenerator } from "@/lib/server/questions/rationales";
import { createSimulationGenerator, backfillSimulations, HAS_SIMULATION, type SimulationGenerator } from "@/lib/server/lessons/simulations-backfill";
import { backfillPrerequisites, createPrerequisiteGenerator, estimateRun as estimatePrerequisites, loadCourseConcepts, type PrerequisiteGenerator } from "@/lib/server/prerequisites/generate";
import { backfillVariants, createVariantGenerator, estimateRun as estimateVariants, loadVariantSources, missingVariantCount, type VariantGenerator } from "@/lib/server/variants/generate";
import { createConceptTagger, objectivesToTag, tagCourseConcepts, type ConceptTagger } from "@/lib/server/psrp/concepts";
import { MAX_NEW_QUESTIONS } from "@/lib/workshop-ai";
import {
  aiNote,
  createObjectiveWithContent,
  ensureAiCheckpoint,
  estimateAi,
  finishAiAccept,
  proposeAi,
  type AiProposal,
  type AiRequest,
  type Generate,
} from "./ai";
import { createRegenerationGenerator, estimateObjectiveTokens, regenerateStaleContent, regenerationTodo, type RegenerationGenerator } from "@/lib/server/lessons/stale-regeneration";
import { backfillPossible, lessonsNeedingPossible } from "./possible-backfill";
import { getCourseReport, type Improvement, type ImprovementKind } from "./report";
import { createQuestion, editableCourse, saveQuestion, saveSection } from "./service";

export const BATCH_KINDS = ["quality", "simulations", "concepts", "variants", "explanations", "prerequisites", "formats", "rationales", "blocks", "possible", "stale"] as const;

/** Formatfragen je Lernziel, wenn der Sammellauf sie ergänzt. */
export const FORMAT_QUESTIONS_PER_OBJECTIVE = 2;

/** Arten von Verbesserungspunkten, die die KI bearbeiten kann. */
export const QUALITY_KINDS = [
  "open_report",
  "hard_question",
  "few_questions",
  "small_chapter_pool",
  "one_question_type",
  "hands_on_without_simulation",
  "no_exam_callout",
  "thin_lesson",
  "missing_objective",
] as const satisfies readonly ImprovementKind[];

export const qualityParamsSchema = z.object({
  kinds: z.array(z.enum(QUALITY_KINDS)).min(1),
  /** Obergrenze je Lauf (Schutz vor unerwartet hohen Kosten). */
  maxItems: z.number().int().min(1).max(300).default(100),
});
export type QualityParams = z.infer<typeof qualityParamsSchema>;

export const batchTargetSchema = z.object({ kind: z.enum(BATCH_KINDS), certificationId: z.string().uuid().nullable().default(null) });

export class BatchAlreadyRunningError extends Error {}
export class BatchNothingToDoError extends Error {}

/* ------------------------------------------------------------------ Planung (rein) */

export type QualityTask = { key: string; request: AiRequest; improvementKinds: ImprovementKind[]; label: string };

const ORDER: Record<string, number> = { fix_reports: 0, improve: 1, expand: 2, example: 3, simulation: 4, exam: 5, add_questions: 6, add_objective: 7 };
const ONE_TYPE_NOTE = "Verwende bei den neuen Fragen andere Fragetypen als die vorhandenen (z. B. Anwendung, Szenario, Fehlersuche), damit der Fragenpool abwechslungsreicher wird.";

/**
 * Verbesserungspunkte → KI-Anfragen. Doppelte werden zusammengelegt (je Lektion und Aktion, je Lernziel einmal „Fragen
 * ergänzen“ mit der größeren Anzahl). Reihenfolge: erst Fehlermeldungen, dann Qualität, Ergänzungen, zuletzt neue Lernziele.
 */
export function planQualityTasks(improvements: Improvement[], kinds: readonly ImprovementKind[], maxItems = 100): QualityTask[] {
  const wanted = new Set(kinds);
  const tasks = new Map<string, QualityTask>();
  const add = (key: string, request: AiRequest, kind: ImprovementKind, label: string) => {
    const existing = tasks.get(key);
    if (existing) {
      if (!existing.improvementKinds.includes(kind)) existing.improvementKinds.push(kind);
      if (request.target === "objective" && existing.request.target === "objective") {
        existing.request = { ...existing.request, count: Math.max(existing.request.count, request.count), instruction: existing.request.instruction ?? request.instruction };
      }
      return;
    }
    tasks.set(key, { key, request, improvementKinds: [kind], label });
  };
  for (const i of improvements) {
    if (!wanted.has(i.kind)) continue;
    const label = i.text.de;
    switch (i.kind) {
      case "open_report":
        if (i.sectionId) add(`section:${i.sectionId}:fix_reports`, { target: "section", id: i.sectionId, action: "fix_reports" }, i.kind, label);
        else if (i.questionId) add(`question:${i.questionId}:fix_reports`, { target: "question", id: i.questionId, action: "fix_reports" }, i.kind, label);
        break;
      case "hard_question":
        if (i.questionId) add(`question:${i.questionId}:improve`, { target: "question", id: i.questionId, action: "improve" }, i.kind, label);
        break;
      case "few_questions":
        if (i.objectiveId) add(`objective:${i.objectiveId}`, { target: "objective", id: i.objectiveId, action: "add_questions", count: Math.min(MAX_NEW_QUESTIONS, Math.max(1, i.needed ?? 4)) }, i.kind, label);
        break;
      case "small_chapter_pool":
        for (const t of i.chapterPool?.perObjective ?? []) add(`objective:${t.objectiveId}`, { target: "objective", id: t.objectiveId, action: "add_questions", count: Math.min(MAX_NEW_QUESTIONS, Math.max(1, t.count)) }, i.kind, label);
        break;
      case "one_question_type":
        if (i.objectiveId) add(`objective:${i.objectiveId}`, { target: "objective", id: i.objectiveId, action: "add_questions", count: 3, instruction: ONE_TYPE_NOTE }, i.kind, label);
        break;
      case "hands_on_without_simulation":
        if (i.sectionId) add(`section:${i.sectionId}:simulation`, { target: "section", id: i.sectionId, action: "simulation" }, i.kind, label);
        break;
      case "no_exam_callout":
        if (i.sectionId) add(`section:${i.sectionId}:exam`, { target: "section", id: i.sectionId, action: "exam" }, i.kind, label);
        break;
      case "thin_lesson":
        if (i.sectionId) add(`section:${i.sectionId}:expand`, { target: "section", id: i.sectionId, action: "expand" }, i.kind, label);
        break;
      case "missing_objective":
        if (i.missing?.domainId) add(`missing:${i.missing.code}`, { target: "missing-objective", domainId: i.missing.domainId, code: i.missing.code, title: i.missing.title, action: "add_objective" }, i.kind, label);
        break;
    }
  }
  return [...tasks.values()].sort((a, b) => (ORDER[a.request.action] ?? 9) - (ORDER[b.request.action] ?? 9)).slice(0, maxItems);
}

/* ------------------------------------------------------------------ Übernehmen */

export type Applied = { sections: string[]; questions: string[]; created: number };

/** Einen KI-Vorschlag ohne Einzelprüfung speichern (dieselben Speicherwege wie in der Werkstatt, Herkunft „KI“). */
export async function applyProposal(certId: string, proposal: AiProposal, userId: string | null): Promise<Applied> {
  const note = aiNote(proposal.action, "Sammellauf");
  const out: Applied = { sections: [], questions: [], created: 0 };
  if (proposal.kind === "section") {
    const r = await saveSection(certId, proposal.sectionId, proposal.snapshot, proposal.baseFingerprint, { userId, origin: "ai", note });
    if (r.changed) out.sections.push(proposal.sectionId);
  } else if (proposal.kind === "question") {
    const r = await saveQuestion(certId, proposal.questionId, proposal.snapshot, proposal.baseFingerprint, { userId, origin: "ai", note });
    if (r.changed) out.questions.push(proposal.questionId);
  } else if (proposal.kind === "questions") {
    for (const q of proposal.questions) {
      const r = await createQuestion(certId, proposal.objectiveId, q);
      out.questions.push(r.questionId);
    }
  } else {
    await createObjectiveWithContent(certId, {
      domainId: proposal.domainId,
      code: proposal.code,
      title: proposal.title,
      description: proposal.description,
      sections: proposal.sections,
      questions: proposal.questions,
    });
    out.created++;
  }
  return out;
}

/* ------------------------------------------------------------------ Kostenschätzung */

const SYSTEM_TOKENS = 3500;
const tokens = (chars: number) => Math.ceil(chars / 3.5);

export type BatchEstimate = { kind: AiBatchKind; items: number; usd: number | null; courses: number };

async function generalCourses(certId: string | null) {
  const rows = await getDb()
    .select({ id: certifications.id, name: certifications.name, kind: certifications.kind, ownerOrganizationId: certifications.ownerOrganizationId })
    .from(certifications)
    .where(certId ? and(eq(certifications.id, certId), eq(certifications.kind, "general")) : eq(certifications.kind, "general"))
    .orderBy(asc(certifications.name));
  return rows;
}

async function lessonsWithoutSimulation(certIds: string[]) {
  if (!certIds.length) return [];
  const rows = await getDb()
    .select({ certId: domains.certificationId, content: lessons.content })
    .from(lessons)
    .innerJoin(sections, eq(sections.id, lessons.sectionId))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(inArray(domains.certificationId, certIds));
  return rows.filter((r) => !HAS_SIMULATION.test(r.content.de) && !HAS_SIMULATION.test(r.content.en));
}

/** Anzahl der Konzepte eines Kurses, für den noch gar keine Voraussetzungen vorgeschlagen wurden (sonst 0; mindestens zwei Konzepte nötig). */
async function conceptsWithoutPrerequisites(certId: string): Promise<number> {
  const all = await loadCourseConcepts(certId);
  if (all.length < 2) return 0;
  const [edge] = await getDb()
    .select({ id: conceptPrerequisites.id })
    .from(conceptPrerequisites)
    .innerJoin(concepts, eq(concepts.id, conceptPrerequisites.conceptId))
    .where(eq(concepts.courseId, certId))
    .limit(1);
  return edge ? 0 : all.length;
}

/** Lernziele mit Auswahlfragen, aber ohne eine einzige Formatfrage (Reihenfolge, Kurzantwort, Zuordnung). */
async function objectivesWithoutFormatQuestions(certIds: string[]): Promise<Array<{ certId: string; objectiveId: string }>> {
  if (!certIds.length) return [];
  const live = and(eq(questions.stale, false), eq(questions.probeOnly, false));
  const rows = await getDb()
    .selectDistinct({ certId: domains.certificationId, objectiveId: objectives.id, code: objectives.code })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .innerJoin(questions, and(eq(questions.objectiveId, objectives.id), live, eq(questions.answerFormat, "choice")))
    .where(
      and(
        inArray(domains.certificationId, certIds),
        notExists(getDb().select({ one: sql`1` }).from(questions).where(and(eq(questions.objectiveId, objectives.id), live, ne(questions.answerFormat, "choice")))),
      ),
    )
    .orderBy(asc(domains.certificationId), asc(objectives.code));
  return rows.map(({ certId, objectiveId }) => ({ certId, objectiveId }));
}

async function lessonsWithoutBlocks(certIds: string[]) {
  if (!certIds.length) return [];
  const rows = await getDb()
    .select({ certId: domains.certificationId, content: lessons.content })
    .from(lessons)
    .innerJoin(sections, eq(sections.id, lessons.sectionId))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(inArray(domains.certificationId, certIds));
  return rows.filter((r) => !HAS_BLOCKS.test(r.content.de) && !HAS_BLOCKS.test(r.content.en));
}

export async function estimateBatch(kind: AiBatchKind, certId: string | null, params?: unknown): Promise<BatchEstimate> {
  if (kind === "quality") {
    if (!certId) throw new BatchNothingToDoError("Der Qualitätsbericht gilt für einen Kurs.");
    const p = qualityParamsSchema.parse(params);
    const tasks = planQualityTasks((await getCourseReport(certId)).improvements, p.kinds, p.maxItems);
    let usd: number | null = 0;
    for (const t of tasks) {
      const r = t.request;
      const est = await estimateAi(certId, r.target === "section" ? { target: "section", id: r.id } : r.target === "question" ? { target: "question", id: r.id } : r.target === "objective" ? { target: "objective", count: r.count } : { target: "missing-objective" }).catch(() => []);
      const match = est.find((e) => e.action === r.action);
      usd = usd !== null && match?.usd != null ? usd + match.usd : null;
    }
    return { kind, items: tasks.length, usd: tasks.length ? usd : 0, courses: 1 };
  }
  const courses = await generalCourses(certId);
  if (kind === "simulations") {
    const todo = await lessonsWithoutSimulation(courses.map((c) => c.id));
    const usd = todo.reduce<number | null>((sum, l) => {
      const c = estimateCostUsd(SYSTEM_TOKENS + tokens(l.content.de.length + l.content.en.length), tokens(4500), LESSONS_MODEL);
      return sum !== null && c !== null ? sum + c : null;
    }, 0);
    return { kind, items: todo.length, usd, courses: new Set(todo.map((l) => l.certId)).size };
  }
  if (kind === "variants") {
    let items = 0, usd: number | null = 0, withWork = 0;
    for (const c of courses) {
      const e = estimateVariants((await loadVariantSources(c.id)).filter((x) => missingVariantCount(x.existingVariants.length) > 0));
      items += e.items;
      if (e.items) withWork++;
      usd = usd !== null && e.costUsd !== null ? usd + e.costUsd : null;
    }
    return { kind, items, usd: items ? usd : 0, courses: withWork };
  }
  if (kind === "explanations") {
    let items = 0, usd: number | null = 0, withWork = 0;
    for (const c of courses) {
      const e = estimateExplanations((await loadExplanationSources(c.id)).filter((x) => missingKinds(x.existingKinds).length > 0));
      items += e.objectives;
      if (e.objectives) withWork++;
      usd = usd !== null && e.costUsd !== null ? usd + e.costUsd : null;
    }
    return { kind, items, usd: items ? usd : 0, courses: withWork };
  }
  if (kind === "prerequisites") {
    let items = 0, usd: number | null = 0, withWork = 0;
    for (const c of courses) {
      const n = await conceptsWithoutPrerequisites(c.id);
      if (!n) continue;
      const e = estimatePrerequisites(n);
      items += e.requests;
      withWork++;
      usd = usd !== null && e.costUsd !== null ? usd + e.costUsd : null;
    }
    return { kind, items, usd: items ? usd : 0, courses: withWork };
  }
  if (kind === "rationales") {
    let items = 0, withWork = 0;
    for (const c of courses) {
      const n = (await questionsWithoutRationales(c.id)).length;
      items += n;
      if (n) withWork++;
    }
    const each = estimateCostUsd(SYSTEM_TOKENS + tokens(1500), tokens(1200), LESSONS_MODEL);
    return { kind, items, usd: each === null ? null : items * each, courses: withWork };
  }
  if (kind === "blocks") {
    const todo = await lessonsWithoutBlocks(courses.map((c) => c.id));
    const usd = todo.reduce<number | null>((sum, l) => {
      const chars = l.content.de.length + l.content.en.length;
      const c = estimateCostUsd(SYSTEM_TOKENS + tokens(chars), tokens(chars * 1.2), LESSONS_MODEL);
      return sum !== null && c !== null ? sum + c : null;
    }, 0);
    return { kind, items: todo.length, usd, courses: new Set(todo.map((l) => l.certId)).size };
  }
  if (kind === "stale") {
    // Nur Lernziele mit Quelle: ohne Quellenausschnitte gibt es keine Grundlage (siehe lib/server/lessons/stale-regeneration.ts).
    let items = 0, withWork = 0;
    let usd: number | null = 0;
    for (const c of courses) {
      const { todo } = await regenerationTodo(c.id);
      if (todo.length) withWork++;
      items += todo.length;
      for (const work of todo) {
        const t = estimateObjectiveTokens(work);
        const cost = estimateCostUsd(SYSTEM_TOKENS + t.prompt, t.completion, LESSONS_MODEL);
        usd = usd !== null && cost !== null ? usd + cost : null;
      }
    }
    return { kind, items, usd: items ? usd : 0, courses: withWork };
  }
  if (kind === "possible") {
    let items = 0, withWork = 0;
    for (const c of courses) {
      const n = (await lessonsNeedingPossible(c.id)).length;
      items += n;
      if (n) withWork++;
    }
    const each = estimateCostUsd(SYSTEM_TOKENS + tokens(8000), tokens(8000), LESSONS_MODEL);
    return { kind, items, usd: each === null ? null : items * each, courses: withWork };
  }
  if (kind === "formats") {
    const todo = await objectivesWithoutFormatQuestions(courses.map((c) => c.id));
    const each = estimateCostUsd(SYSTEM_TOKENS + tokens(12_000), tokens(FORMAT_QUESTIONS_PER_OBJECTIVE * 1200), LESSONS_MODEL);
    return { kind, items: todo.length, usd: each === null ? null : todo.length * each, courses: new Set(todo.map((t) => t.certId)).size };
  }
  let items = 0;
  let withWork = 0;
  for (const c of courses) {
    const n = (await objectivesToTag(c.id)).length;
    items += n;
    if (n) withWork++;
  }
  return { kind, items, usd: estimateCostUsd(SYSTEM_TOKENS + tokens(12_000), tokens(9000), LESSONS_MODEL) === null ? null : items * (estimateCostUsd(SYSTEM_TOKENS + tokens(12_000), tokens(9000), LESSONS_MODEL) ?? 0), courses: withWork };
}

/* ------------------------------------------------------------------ Läufe */

export type BatchRunView = {
  id: string;
  kind: AiBatchKind;
  certificationId: string | null;
  status: AiBatchStatus;
  total: number;
  processed: number;
  applied: number;
  skipped: number;
  failed: number;
  costUsd: number | null;
  message: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

type Row = typeof aiBatchRuns.$inferSelect;
const view = (r: Row): BatchRunView => ({
  id: r.id, kind: r.kind, certificationId: r.certificationId, status: r.status, total: r.total, processed: r.processed, applied: r.applied,
  skipped: r.skipped, failed: r.failed, costUsd: r.costUsd === null ? null : Number(r.costUsd), message: r.message, startedAt: r.startedAt, finishedAt: r.finishedAt,
});

const globalForBatch = globalThis as unknown as { aiBatchActive?: Map<string, Promise<void>> };
const active = globalForBatch.aiBatchActive ?? new Map<string, Promise<void>>();
globalForBatch.aiBatchActive = active;

export const isBatchActive = (runId: string) => active.has(runId);
/** Wartet, bis der Hintergrundlauf fertig ist (für Tests). */
export const awaitBatch = (runId: string) => active.get(runId) ?? Promise.resolve();

async function patch(runId: string, values: Partial<typeof aiBatchRuns.$inferInsert>) {
  await getDb().update(aiBatchRuns).set({ ...values, updatedAt: new Date() }).where(eq(aiBatchRuns.id, runId));
}
const cancelled = async (runId: string) => {
  const [r] = await getDb().select({ status: aiBatchRuns.status }).from(aiBatchRuns).where(eq(aiBatchRuns.id, runId)).limit(1);
  return r?.status === "cancelled";
};

/** Letzter Lauf einer Art (für einen Kurs oder alle Kurse). Ein „laufender“ Lauf ohne aktiven Prozess ging durch einen Neustart verloren. */
export async function getBatchStatus(kind: AiBatchKind, certId: string | null): Promise<BatchRunView | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(aiBatchRuns)
    .where(and(eq(aiBatchRuns.kind, kind), certId ? eq(aiBatchRuns.certificationId, certId) : isNull(aiBatchRuns.certificationId)))
    .orderBy(desc(aiBatchRuns.startedAt))
    .limit(1);
  if (!row) return null;
  if (row.status === "running" && !active.has(row.id)) {
    const message = "Der Lauf wurde nicht beendet (Server neu gestartet?). Bereits Übernommenes bleibt; bitte erneut starten.";
    await db.update(aiBatchRuns).set({ status: "failed", message, finishedAt: new Date(), updatedAt: new Date() }).where(eq(aiBatchRuns.id, row.id));
    return view({ ...row, status: "failed", message, finishedAt: new Date() });
  }
  return view(row);
}

export async function cancelBatch(kind: AiBatchKind, certId: string | null): Promise<boolean> {
  const rows = await getDb()
    .update(aiBatchRuns)
    .set({ status: "cancelled", message: "Abgebrochen. Bereits Übernommenes bleibt.", updatedAt: new Date() })
    .where(and(eq(aiBatchRuns.kind, kind), eq(aiBatchRuns.status, "running"), certId ? eq(aiBatchRuns.certificationId, certId) : isNull(aiBatchRuns.certificationId)))
    .returning({ id: aiBatchRuns.id });
  return rows.length > 0;
}

export type BatchDeps = {
  generate?: Generate;
  simulationGenerator?: SimulationGenerator;
  conceptTagger?: ConceptTagger;
  variantGenerator?: VariantGenerator;
  explanationGenerator?: ExplanationGenerator;
  prerequisiteGenerator?: PrerequisiteGenerator;
  rationaleGenerator?: RationaleGenerator;
  blocksGenerator?: BlocksGenerator;
  regenerationGenerator?: RegenerationGenerator;
};

function isUniqueViolation(error: unknown): boolean {
  // Drizzle verpackt den Datenbankfehler; der Postgres-Code steht je nach Version am Fehler oder an `cause`.
  const code = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? (e as { code?: unknown }).code : undefined);
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
}

/** Startet einen Sammellauf im Hintergrund; gibt sofort die Lauf-ID zurück. */
export async function startBatch(
  input: { kind: AiBatchKind; certificationId: string | null; params?: unknown; userId: string | null },
  deps: BatchDeps = {},
): Promise<{ runId: string }> {
  if (input.certificationId) await editableCourse(input.certificationId);
  if (input.kind === "quality" && !input.certificationId) throw new BatchNothingToDoError("Der Qualitätsbericht gilt für einen Kurs.");
  const params = input.kind === "quality" ? qualityParamsSchema.parse(input.params) : {};
  const estimate = await estimateBatch(input.kind, input.certificationId, params);
  if (estimate.items === 0) throw new BatchNothingToDoError("Es gibt nichts zu tun.");
  if (!Object.values(deps).some(Boolean)) {
    const budget = await getAiBudgetStatus();
    if (budget?.exceeded) throw new BatchNothingToDoError(`Das KI-Budget ist ausgeschöpft (${budget.spentUsd.toFixed(2)} von ${budget.limitUsd.toFixed(2)} USD).`);
  }
  let run: Row;
  try {
    [run] = await getDb()
      .insert(aiBatchRuns)
      .values({ kind: input.kind, certificationId: input.certificationId, startedByUserId: input.userId, params, total: estimate.items })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) throw new BatchAlreadyRunningError("Dazu läuft schon ein Lauf.");
    throw error;
  }
  const done = execute(run, input.userId, params, deps)
    .catch(async (error) => {
      console.error("KI-Sammellauf fehlgeschlagen:", error);
      await patch(run.id, { status: "failed", message: `Fehler: ${error instanceof Error ? error.message.slice(0, 300) : "unbekannt"}`, finishedAt: new Date() }).catch(() => {});
    })
    .finally(() => active.delete(run.id));
  active.set(run.id, done);
  return { runId: run.id };
}

async function finish(run: Row, counts: { processed: number; applied: number; skipped: number; failed: number; costUsd: number | null }, aborted: boolean, userId: string | null) {
  const wasCancelled = await cancelled(run.id);
  const status: AiBatchStatus = wasCancelled ? "cancelled" : aborted ? "failed" : "done";
  const message = wasCancelled
    ? "Abgebrochen. Bereits Übernommenes bleibt."
    : aborted
      ? "Abgebrochen, weil die ersten Aufrufe alle fehlgeschlagen sind (KI-Zugang oder Budget prüfen)."
      : `Fertig: ${counts.applied} übernommen, ${counts.skipped} übersprungen, ${counts.failed} fehlgeschlagen.`;
  await patch(run.id, { status, message, finishedAt: new Date(), ...counts, costUsd: counts.costUsd === null ? null : String(counts.costUsd) });
  await recordAuditEvent({ actorUserId: userId, action: "course.ai_batch", targetType: "certification", targetId: run.certificationId ?? run.id, metadata: { kind: run.kind, runId: run.id, ...counts, status } }).catch(() => {});
}

async function execute(run: Row, userId: string | null, params: unknown, deps: BatchDeps): Promise<void> {
  if (run.kind === "quality") return executeQuality(run, userId, qualityParamsSchema.parse(params), deps);
  if (run.kind === "simulations") return executeSimulations(run, userId, deps);
  if (run.kind === "variants") return executeVariants(run, userId, deps);
  if (run.kind === "explanations") return executeExplanations(run, userId, deps);
  if (run.kind === "prerequisites") return executePrerequisites(run, userId, deps);
  if (run.kind === "formats") return executeFormats(run, userId, deps);
  if (run.kind === "rationales") return executeRationales(run, userId, deps);
  if (run.kind === "blocks") return executeBlocks(run, userId, deps);
  if (run.kind === "possible") return executePossible(run, userId, deps);
  if (run.kind === "stale") return executeStale(run, userId, deps);
  return executeConcepts(run, userId, deps);
}

const ABORT_AFTER_FAILURES = 3;

async function executeQuality(run: Row, userId: string | null, params: QualityParams, deps: BatchDeps) {
  const certId = run.certificationId!;
  const tasks = planQualityTasks((await getCourseReport(certId)).improvements, params.kinds, params.maxItems);
  const counts = { processed: 0, applied: 0, skipped: 0, failed: 0, costUsd: null as number | null };
  const changedSections = new Set<string>();
  const changedQuestions = new Set<string>();
  const reportSections = new Set<string>();
  const reportQuestions = new Set<string>();
  let streak = 0;
  let aborted = false;
  await ensureAiCheckpoint(certId, userId);
  for (const task of tasks) {
    if (await cancelled(run.id)) break;
    if (!deps.generate) {
      const budget = await getAiBudgetStatus();
      if (budget?.exceeded) { aborted = true; break; }
    }
    try {
      const proposal = await proposeAi(certId, task.request, { generate: deps.generate });
      counts.costUsd = (counts.costUsd ?? 0) + (proposal.costUsd ?? 0);
      const applied = await applyProposal(certId, proposal, userId);
      streak = 0;
      const changed = applied.sections.length + applied.questions.length + applied.created;
      if (changed === 0) counts.skipped++;
      else counts.applied++;
      for (const id of applied.sections) { changedSections.add(id); if (task.request.action === "fix_reports") reportSections.add(id); }
      for (const id of applied.questions) { changedQuestions.add(id); if (task.request.action === "fix_reports") reportQuestions.add(id); }
    } catch (error) {
      console.error("Sammellauf: Verbesserung fehlgeschlagen:", task.key, error instanceof Error ? error.message : error);
      counts.failed++;
      streak++;
      if (streak >= ABORT_AFTER_FAILURES && counts.applied === 0) { aborted = true; counts.processed++; break; }
    }
    counts.processed++;
    await patch(run.id, { processed: counts.processed, applied: counts.applied, skipped: counts.skipped, failed: counts.failed, costUsd: counts.costUsd === null ? null : String(counts.costUsd) });
  }
  // Gemeldete Fehler als erledigt schließen, andere Sprache nachziehen (einmal am Ende).
  const reported = { sections: [...reportSections], questions: [...reportQuestions] };
  const others = { sections: [...changedSections].filter((id) => !reportSections.has(id)), questions: [...changedQuestions].filter((id) => !reportQuestions.has(id)) };
  if (reported.sections.length || reported.questions.length) await finishAiAccept(certId, reported, { userId, resolveReports: true, checkpoint: null, startTranslation: false });
  await finishAiAccept(certId, others, { userId, checkpoint: null });
  await finish(run, counts, aborted, userId);
}

async function executeSimulations(run: Row, userId: string | null, deps: BatchDeps) {
  const courses = await generalCourses(run.certificationId);
  const counts = { processed: 0, applied: 0, skipped: 0, failed: 0, costUsd: null as number | null };
  let aborted = false;
  for (const course of courses) {
    if (await cancelled(run.id)) break;
    if (!deps.simulationGenerator) {
      const budget = await getAiBudgetStatus();
      if (budget?.exceeded) { aborted = true; break; }
    }
    const usage = { prompt: 0, completion: 0 };
    const generator = deps.simulationGenerator ?? createSimulationGenerator(await clientFor(course), (u) => { usage.prompt += u.promptTokens; usage.completion += u.completionTokens; });
    const base = { ...counts };
    const result = await backfillSimulations(course.id, generator, {
      usage,
      shouldStop: () => cancelled(run.id),
      onProgress: (c) => {
        void patch(run.id, {
          processed: base.processed + c.added + c.unsuitable + c.failed,
          applied: base.applied + c.added,
          skipped: base.skipped + c.unsuitable,
          failed: base.failed + c.failed,
          costUsd: String((base.costUsd ?? 0) + (c.costUsd ?? 0)),
        });
      },
    });
    counts.processed += result.added + result.unsuitable + result.failed;
    counts.applied += result.added;
    counts.skipped += result.unsuitable;
    counts.failed += result.failed;
    const spent = estimateCostUsd(usage.prompt, usage.completion, LESSONS_MODEL);
    counts.costUsd = spent === null ? counts.costUsd : (counts.costUsd ?? 0) + spent;
    if (result.aborted && result.added === 0) aborted = true;
    if (aborted) break;
  }
  await finish(run, counts, aborted, userId);
}

async function executeConcepts(run: Row, userId: string | null, deps: BatchDeps) {
  const courses = await generalCourses(run.certificationId);
  const counts = { processed: 0, applied: 0, skipped: 0, failed: 0, costUsd: null as number | null };
  let aborted = false;
  for (const course of courses) {
    if (await cancelled(run.id)) break;
    if (!deps.conceptTagger) {
      const budget = await getAiBudgetStatus();
      if (budget?.exceeded) { aborted = true; break; }
    }
    const tagger = deps.conceptTagger ?? createConceptTagger(await clientFor(course));
    const base = { ...counts };
    const result = await tagCourseConcepts(course.id, tagger, {
      shouldStop: () => cancelled(run.id),
      onProgress: (c) => void patch(run.id, { processed: base.processed + c.objectives + c.failed, applied: base.applied + c.objectives, failed: base.failed + c.failed }),
    });
    counts.processed += result.objectives + result.failed;
    counts.applied += result.objectives;
    counts.failed += result.failed;
    if (result.failed > 0 && result.objectives === 0 && courses.length === 1) aborted = true;
  }
  await finish(run, counts, aborted, userId);
}

/** Gemeinsamer Rahmen der kursweisen Läufe: Abbruch, Budget, Fortschritt. `work` meldet über `report` den Stand dieses Kurses. */
async function perCourse(
  run: Row,
  userId: string | null,
  hasOwnGenerator: boolean,
  work: (course: Awaited<ReturnType<typeof generalCourses>>[number], report: (c: { processed: number; applied: number; skipped?: number; failed: number }) => void, shouldStop: () => Promise<boolean>) => Promise<{ processed: number; applied: number; skipped?: number; failed: number; aborted: boolean }>,
) {
  const courses = await generalCourses(run.certificationId);
  const counts = { processed: 0, applied: 0, skipped: 0, failed: 0, costUsd: null as number | null };
  let aborted = false;
  for (const course of courses) {
    if (await cancelled(run.id)) break;
    if (!hasOwnGenerator) {
      const budget = await getAiBudgetStatus();
      if (budget?.exceeded) { aborted = true; break; }
    }
    const base = { ...counts };
    const result = await work(
      course,
      (c) => void patch(run.id, { processed: base.processed + c.processed, applied: base.applied + c.applied, skipped: base.skipped + (c.skipped ?? 0), failed: base.failed + c.failed }),
      () => cancelled(run.id),
    );
    counts.processed += result.processed;
    counts.applied += result.applied;
    counts.skipped += result.skipped ?? 0;
    counts.failed += result.failed;
    if (result.aborted && result.applied === 0) aborted = true;
    if (aborted) break;
  }
  await finish(run, counts, aborted, userId);
}

async function executeVariants(run: Row, userId: string | null, deps: BatchDeps) {
  await perCourse(run, userId, Boolean(deps.variantGenerator), async (course, report) => {
    const generator = deps.variantGenerator ?? createVariantGenerator(await clientFor(course));
    const r = await backfillVariants(course.id, generator, { onProgress: (c) => report({ processed: c.items + c.failed, applied: c.items, failed: c.failed }) });
    return { processed: r.items + r.failed, applied: r.items, failed: r.failed, aborted: r.aborted };
  });
}

async function executeExplanations(run: Row, userId: string | null, deps: BatchDeps) {
  await perCourse(run, userId, Boolean(deps.explanationGenerator), async (course, report) => {
    const generator = deps.explanationGenerator ?? createExplanationGenerator(await clientFor(course));
    const r = await backfillExplanations(course.id, generator, { onProgress: (c) => report({ processed: c.objectives + c.failed, applied: c.objectives, failed: c.failed }) });
    return { processed: r.objectives + r.failed, applied: r.objectives, failed: r.failed, aborted: r.aborted };
  });
}

async function executePrerequisites(run: Row, userId: string | null, deps: BatchDeps) {
  await perCourse(run, userId, Boolean(deps.prerequisiteGenerator), async (course, report) => {
    if (!(await conceptsWithoutPrerequisites(course.id))) return { processed: 0, applied: 0, failed: 0, aborted: false };
    const generator = deps.prerequisiteGenerator ?? createPrerequisiteGenerator(await clientFor(course));
    let requests = 0;
    const r = await backfillPrerequisites(course.id, generator, {
      onProgress: (c) => {
        requests++;
        report({ processed: requests, applied: requests - c.failed, failed: c.failed });
      },
    });
    return { processed: requests, applied: requests - r.failed, failed: r.failed, aborted: r.aborted };
  });
}

async function executeFormats(run: Row, userId: string | null, deps: BatchDeps) {
  const todo = await objectivesWithoutFormatQuestions((await generalCourses(run.certificationId)).map((c) => c.id));
  const counts = { processed: 0, applied: 0, skipped: 0, failed: 0, costUsd: null as number | null };
  const changedQuestions = new Map<string, string[]>();
  let streak = 0;
  let aborted = false;
  const checkpointed = new Set<string>();
  for (const task of todo) {
    if (await cancelled(run.id)) break;
    if (!deps.generate) {
      const budget = await getAiBudgetStatus();
      if (budget?.exceeded) { aborted = true; break; }
    }
    try {
      if (!checkpointed.has(task.certId)) {
        await ensureAiCheckpoint(task.certId, userId);
        checkpointed.add(task.certId);
      }
      const proposal = await proposeAi(task.certId, { target: "objective", id: task.objectiveId, action: "add_format_questions", count: FORMAT_QUESTIONS_PER_OBJECTIVE }, { generate: deps.generate });
      counts.costUsd = (counts.costUsd ?? 0) + (proposal.costUsd ?? 0);
      const applied = await applyProposal(task.certId, proposal, userId);
      streak = 0;
      if (applied.questions.length === 0) counts.skipped++;
      else {
        counts.applied++;
        changedQuestions.set(task.certId, [...(changedQuestions.get(task.certId) ?? []), ...applied.questions]);
      }
    } catch (error) {
      console.error("Sammellauf: Formatfragen fehlgeschlagen:", task.objectiveId, error instanceof Error ? error.message : error);
      counts.failed++;
      streak++;
      if (streak >= ABORT_AFTER_FAILURES && counts.applied === 0) { aborted = true; counts.processed++; break; }
    }
    counts.processed++;
    await patch(run.id, { processed: counts.processed, applied: counts.applied, skipped: counts.skipped, failed: counts.failed, costUsd: counts.costUsd === null ? null : String(counts.costUsd) });
  }
  for (const [certId, ids] of changedQuestions) await finishAiAccept(certId, { sections: [], questions: ids }, { userId, checkpoint: null });
  await finish(run, counts, aborted, userId);
}

async function executeRationales(run: Row, userId: string | null, deps: BatchDeps) {
  await perCourse(run, userId, Boolean(deps.rationaleGenerator), async (course, report, shouldStop) => {
    const generator = deps.rationaleGenerator ?? createRationaleGenerator(await clientFor(course));
    const r = await backfillRationales(course.id, generator, { shouldStop, onProgress: (c) => report({ processed: c.created + c.failed, applied: c.created, failed: c.failed }) });
    return { processed: r.created + r.failed, applied: r.created, failed: r.failed, aborted: r.aborted };
  });
}

async function executeBlocks(run: Row, userId: string | null, deps: BatchDeps) {
  await perCourse(run, userId, Boolean(deps.blocksGenerator), async (course, report, shouldStop) => {
    const generator = deps.blocksGenerator ?? createBlocksGenerator(await clientFor(course));
    // „übersprungen“ des Nachtrags enthält auch Lektionen, die schon Blöcke hatten; hier zählt nur, was zwischenzeitlich geändert wurde.
    const r = await backfillBlocks(course.id, generator, { shouldStop, onProgress: (c) => report({ processed: c.updated + c.failed, applied: c.updated, failed: c.failed }) });
    return { processed: r.updated + r.failed, applied: r.updated, failed: r.failed, aborted: r.aborted };
  });
}

async function executeStale(run: Row, userId: string | null, deps: BatchDeps) {
  await perCourse(run, userId, Boolean(deps.regenerationGenerator), async (course, report, shouldStop) => {
    if ((await regenerationTodo(course.id)).todo.length === 0) return { processed: 0, applied: 0, failed: 0, aborted: false };
    // Veraltete Lektionen werden ersetzt: vorher einen Kursstand merken (wie bei der Qualitätsverbesserung); der alte Text bleibt zusätzlich als Revision.
    await ensureAiCheckpoint(course.id, userId);
    const generator = deps.regenerationGenerator ?? createRegenerationGenerator(await clientFor(course));
    const r = await regenerateStaleContent({ id: course.id, name: course.name }, generator, {
      actor: { userId, origin: "ai", note: "Veraltete oder fehlende Inhalte aus der aktuellen Quelle neu erzeugt" },
      shouldStop,
      onProgress: (c) => report({ processed: c.objectives + c.failed, applied: c.objectives, skipped: c.skipped, failed: c.failed }),
    });
    return { processed: r.objectives + r.failed, applied: r.objectives, skipped: r.skipped, failed: r.failed, aborted: r.aborted };
  });
}

async function executePossible(run: Row, userId: string | null, deps: BatchDeps) {
  await perCourse(run, userId, Boolean(deps.generate), async (course, report, shouldStop) => {
    const r = await backfillPossible(course.id, {
      generate: deps.generate,
      shouldStop,
      startTranslation: true,
      onProgress: (c) => report({ processed: c.updated + c.skipped + c.failed, applied: c.updated, skipped: c.skipped, failed: c.failed }),
    });
    return { processed: r.updated + r.skipped + r.failed, applied: r.updated, skipped: r.skipped, failed: r.failed, aborted: r.failed > 0 && r.updated === 0 && r.skipped === 0 };
  });
}
