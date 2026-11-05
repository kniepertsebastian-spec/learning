import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { GoogleGenAI } from "@google/genai";
import type { AIUsage } from "@/lib/ai/generate";
import { LESSONS_MODEL } from "@/lib/gemini";
import { validateLearningBlocks } from "@/lib/markdown/validate";
import { estimateCostUsd } from "@/lib/server/admin/ai-cost";
import { getObjectiveSourceExcerpts } from "@/lib/server/admin/objective-sources";
import { recordObjectiveGenerationCost } from "@/lib/server/admin/objective-costs";
import { QualityCheckService } from "@/lib/server/admin/quality-checks";
import { generateGroundedLessonsAndQuestionsForObjective, type GroundedLessonsAndQuestions, type SourceExcerpt } from "@/lib/server/ai/service";
import { createQuestion, recordSectionRevision, type Actor } from "@/lib/server/course-editor/service";
import { newQuestionSchema } from "@/lib/server/course-editor/snapshots";
import { getDb } from "@/lib/server/db/client";
import { domains, lessons, objectives, objectiveSourceRefs, questions, sections, type LessonReviewStatus } from "@/lib/server/db/schema";

/**
 * Veraltete und fehlende Inhalte aus der aktuellen Quelle neu erzeugen (Sammellauf „stale“ der KI-Nachbesserung).
 *
 * Wenn eine neue Quellenversion freigegeben wird (lib/server/admin/blueprint-approval.ts), markiert die App die davon
 * betroffenen Lektionen als „stale“ und die Fragen als `stale`; neue Lernziele haben noch gar keine Inhalte. Dieser Lauf
 * erzeugt sie anhand der mit dem Lernziel verknüpften Quellenausschnitte neu. Das ersetzt das frühere Skript
 * `npm run content:draft-lessons`, das genau das tat.
 *
 * - Lektionen: Eine veraltete Lektion wird an Ort und Stelle ersetzt (eine Lektion gehört genau zu einer Lektion der
 *   Gliederung); der alte Stand bleibt als Revision erhalten. Fehlt die Lektion ganz, wird sie angelegt.
 * - Fragen: Veraltete Fragen bleiben stehen (Antworten der Lernenden verweisen darauf) und gelten weiter als veraltet; es
 *   kommen neue hinzu, bis das Lernziel wieder `MIN_CURRENT_QUESTIONS` aktuelle Fragen hat. Eine Frage ohne belegten Locator
 *   (kein Ausschnitt, den es gibt) wird nie gespeichert.
 * - Nur Lernziele mit Quellenausschnitten: ohne Quelle gibt es keine Grundlage, die Zahl dieser Lernziele wird gemeldet.
 */

/** So viele aktuelle (nicht veraltete) Fragen soll ein Lernziel haben. */
export const MIN_CURRENT_QUESTIONS = 5;

export type SectionRow = { id: string; orderNum: number; title: { de: string; en: string }; estimatedMinutes: number | null; difficulty: string | null };
export type LessonRow = { id: string; sectionId: string; reviewStatus: LessonReviewStatus; version: number };
export type ObjectiveWork = {
  objectiveId: string;
  code: string;
  title: string;
  description: string | null;
  sections: SectionRow[];
  lessons: LessonRow[];
  /** Fragen, die nicht als veraltet markiert sind. */
  currentQuestions: number;
  /** Hat das Lernziel Quellenausschnitte? Nur dann kann hier etwas erzeugt werden. */
  grounded: boolean;
};

/** Lektionen der Gliederung, die keine oder eine veraltete Lektion haben. */
export function sectionsNeedingLesson(work: Pick<ObjectiveWork, "sections" | "lessons">): SectionRow[] {
  const current = new Set(work.lessons.filter((l) => l.reviewStatus !== "stale").map((l) => l.sectionId));
  return work.sections.filter((s) => !current.has(s.id));
}

/** Gleiche Bedingung wie beim früheren Skript: übersprungen wird nur, was durchgehend aktuell ist und genug Fragen hat. */
export function needsRegeneration(work: Pick<ObjectiveWork, "sections" | "lessons" | "currentQuestions">): boolean {
  return sectionsNeedingLesson(work).length > 0 || work.currentQuestions < MIN_CURRENT_QUESTIONS;
}

/** Grobe Token-Schätzung je Lernziel für die Kostenvorschau: Quellenausschnitte hinein, je Lektion Text und ein Fragenpool heraus. */
export function estimateObjectiveTokens(work: Pick<ObjectiveWork, "sections" | "lessons">): { prompt: number; completion: number } {
  const lessonsToWrite = Math.max(1, sectionsNeedingLesson(work).length);
  return { prompt: 12_000, completion: 2_500 + lessonsToWrite * 1_800 };
}

/** Alle Lernziele eines Kurses mit dem, was zur Entscheidung nötig ist, in wenigen Abfragen. */
export async function loadObjectiveWork(certId: string): Promise<ObjectiveWork[]> {
  const db = getDb();
  const objs = await db
    .select({ id: objectives.id, code: objectives.code, title: objectives.title, description: objectives.description })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certId))
    .orderBy(asc(domains.orderNum), asc(objectives.code));
  if (objs.length === 0) return [];
  const objectiveIds = objs.map((o) => o.id);

  const secs = await db
    .select({ id: sections.id, objectiveId: sections.objectiveId, orderNum: sections.orderNum, title: sections.title, estimatedMinutes: sections.estimatedMinutes, difficulty: sections.difficulty })
    .from(sections)
    .where(inArray(sections.objectiveId, objectiveIds))
    .orderBy(asc(sections.orderNum));
  const sectionIds = secs.map((s) => s.id);
  const lessonRows = sectionIds.length
    ? await db.select({ id: lessons.id, sectionId: lessons.sectionId, reviewStatus: lessons.reviewStatus, version: lessons.version }).from(lessons).where(inArray(lessons.sectionId, sectionIds))
    : [];
  const questionCounts = await db
    .select({ objectiveId: questions.objectiveId, n: count() })
    .from(questions)
    .where(and(inArray(questions.objectiveId, objectiveIds), eq(questions.stale, false)))
    .groupBy(questions.objectiveId);
  const groundedRows = await db.selectDistinct({ objectiveId: objectiveSourceRefs.objectiveId }).from(objectiveSourceRefs).where(inArray(objectiveSourceRefs.objectiveId, objectiveIds));

  const current = new Map(questionCounts.map((q) => [q.objectiveId, Number(q.n)]));
  const grounded = new Set(groundedRows.map((g) => g.objectiveId));
  const lessonsBySection = new Map(lessonRows.map((l) => [l.sectionId, l]));
  return objs.map((o) => {
    const own = secs.filter((s) => s.objectiveId === o.id);
    return {
      objectiveId: o.id,
      code: o.code,
      title: o.title,
      description: o.description,
      sections: own.map((s) => ({ id: s.id, orderNum: s.orderNum, title: s.title, estimatedMinutes: s.estimatedMinutes, difficulty: s.difficulty })),
      lessons: own.flatMap((s) => (lessonsBySection.has(s.id) ? [lessonsBySection.get(s.id)!] : [])),
      currentQuestions: current.get(o.id) ?? 0,
      grounded: grounded.has(o.id),
    };
  });
}

/** Was ein Lauf für diesen Kurs täte: Lernziele mit Arbeit und Quelle (werden erzeugt), und solche mit Arbeit ohne Quelle (nicht). */
export async function regenerationTodo(certId: string): Promise<{ todo: ObjectiveWork[]; withoutSource: number }> {
  const needing = (await loadObjectiveWork(certId)).filter(needsRegeneration);
  return { todo: needing.filter((w) => w.grounded), withoutSource: needing.filter((w) => !w.grounded).length };
}

export type RegenerationInput = {
  courseName: string;
  objective: { title: string; description: string };
  sections: { orderNum: number; titleEn: string; estimatedMinutes: number; difficulty: string }[];
  excerpts: SourceExcerpt[];
};
export type RegenerationGenerator = (input: RegenerationInput, onUsage: (usage: AIUsage) => void) => Promise<GroundedLessonsAndQuestions>;

export function createRegenerationGenerator(client?: GoogleGenAI): RegenerationGenerator {
  return (input, onUsage) =>
    generateGroundedLessonsAndQuestionsForObjective(input.courseName, input.objective.title, input.objective.description, input.sections, input.excerpts, onUsage, client);
}

export type RegenerationCounts = { objectives: number; lessons: number; questions: number; skipped: number; failed: number; costUsd: number | null; aborted: boolean };

function isDuplicateHumanId(error: unknown): boolean {
  const code = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? (e as { code?: unknown }).code : undefined);
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
}

/** Speichert die Lektionen eines Lernziels. Gibt zurück, wie viele geschrieben wurden. */
async function saveLessons(course: { id: string }, work: ObjectiveWork, drafts: GroundedLessonsAndQuestions["lessons"], sourceVersionId: string, actor: Actor): Promise<number> {
  const db = getDb();
  const sectionByOrder = new Map(work.sections.map((s) => [s.orderNum, s]));
  const lessonBySection = new Map(work.lessons.map((l) => [l.sectionId, l]));
  const needing = new Set(sectionsNeedingLesson(work).map((s) => s.id));
  let saved = 0;
  for (const draft of drafts) {
    const section = sectionByOrder.get(draft.sectionOrderNum);
    if (!section || !needing.has(section.id)) continue;
    const quality = QualityCheckService.checkLessonQuality({ content: draft.content.en, keyTakeaways: draft.keyTakeaways.en, examFocusPoints: draft.examFocusPoints.en });
    if (!quality.passed) continue;
    // Kaputte Lernblöcke (offene Direktiven) würde der Editor beim Speichern ablehnen; hier auch nicht übernehmen.
    if (validateLearningBlocks(draft.content.de).length > 0 || validateLearningBlocks(draft.content.en).length > 0) continue;

    // Nicht belegt: als Prüffall markieren statt wie eine belegte Lektion zu behandeln.
    const reviewStatus: LessonReviewStatus = draft.grounded ? "grounded" : "needs_review";
    const values = {
      content: draft.content,
      keyTakeaways: draft.keyTakeaways,
      examFocusPoints: draft.examFocusPoints,
      promptVersion: "v2-grounded",
      modelVersion: LESSONS_MODEL,
      sourceVersionId,
      reviewStatus,
    };
    const existing = lessonBySection.get(section.id);
    const written = await db.transaction(async (tx) => {
      if (!existing) {
        await tx.insert(lessons).values({ sectionId: section.id, ...values });
        return true;
      }
      // Nur ersetzen, wenn die Lektion seit dem Laden unverändert ist (jemand könnte sie in der Werkstatt bearbeitet haben).
      const [locked] = await tx.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.id, existing.id), eq(lessons.version, existing.version))).for("update");
      if (!locked) return false;
      await recordSectionRevision(tx, course.id, section.id, actor);
      await tx.update(lessons).set({ ...values, version: sql`${lessons.version} + 1`, updatedAt: sql`now()` }).where(eq(lessons.id, existing.id));
      return true;
    });
    if (written) saved++;
  }
  return saved;
}

/** Speichert neue, belegte Fragen, bis das Lernziel genug aktuelle hat. Gibt zurück, wie viele geschrieben wurden. */
async function saveQuestions(course: { id: string }, work: ObjectiveWork, drafts: GroundedLessonsAndQuestions["questions"], excerpts: Array<SourceExcerpt & { chunkId: string }>): Promise<number> {
  const byLocator = new Map(excerpts.map((e) => [e.locator, e]));
  let saved = 0;
  for (const draft of drafts) {
    if (work.currentQuestions + saved >= MIN_CURRENT_QUESTIONS) break;
    // Ohne belegten Locator zu einem echten Ausschnitt keine Frage („Aussagen ohne Grundlage verwerfen“).
    const excerpt = draft.grounded && draft.sourceLocator ? byLocator.get(draft.sourceLocator) : undefined;
    if (!excerpt) continue;
    const quality = QualityCheckService.checkQuestionQuality({
      question: draft.question.en,
      options: draft.options.map((o) => ({ text: o.text.en, isCorrect: o.isCorrect })),
      explanation: draft.explanation.en,
      difficulty: draft.difficulty,
    });
    if (!quality.passed) continue;
    const parsed = newQuestionSchema.safeParse({
      question: draft.question,
      explanation: draft.explanation,
      difficulty: draft.difficulty,
      type: draft.type,
      options: draft.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, rationale: o.isCorrect ? null : (o.rationale ?? null) })),
    });
    if (!parsed.success) continue;
    // Eine gleichzeitig vergebene Frage-ID (zweiter Lauf, Werkstatt) lässt den Insert scheitern: dann mit der nächsten ID erneut.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await createQuestion(course.id, work.objectiveId, parsed.data, { sourceReference: excerpt.locator, sourceChunkId: excerpt.chunkId });
        saved++;
        break;
      } catch (error) {
        if (!isDuplicateHumanId(error) || attempt === 4) throw error;
      }
    }
  }
  return saved;
}

/**
 * Erzeugt für alle Lernziele eines Kurses, die es brauchen und eine Quelle haben, Lektionen und Fragen neu. Ein Lernziel
 * zählt als übernommen, wenn mindestens eine Lektion oder Frage gespeichert wurde, sonst als fehlgeschlagen. Brechen die ersten
 * drei Lernziele alle ab, endet der Lauf (KI-Zugang oder Budget stimmen dann meist nicht).
 */
export async function regenerateStaleContent(
  course: { id: string; name: string },
  generate: RegenerationGenerator,
  opts: { actor: Actor; limit?: number; onProgress?: (c: RegenerationCounts) => void; shouldStop?: () => Promise<boolean> },
): Promise<RegenerationCounts> {
  const { todo, withoutSource } = await regenerationTodo(course.id);
  const counts: RegenerationCounts = { objectives: 0, lessons: 0, questions: 0, skipped: withoutSource, failed: 0, costUsd: null, aborted: false };
  let streak = 0;
  for (const work of todo.slice(0, opts.limit ?? Infinity)) {
    if (await opts.shouldStop?.()) break;
    const excerpts = await getObjectiveSourceExcerpts(work.objectiveId);
    if (excerpts.length === 0) {
      counts.skipped++;
      continue;
    }
    const usages: AIUsage[] = [];
    let drafts: GroundedLessonsAndQuestions;
    try {
      drafts = await generate(
        {
          courseName: course.name,
          objective: { title: work.title, description: work.description ?? work.title },
          sections: work.sections.map((s) => ({ orderNum: s.orderNum, titleEn: s.title.en, estimatedMinutes: s.estimatedMinutes ?? 20, difficulty: s.difficulty ?? "intermediate" })),
          excerpts: excerpts.map((e) => ({ locator: e.locator, text: e.text })),
        },
        (u) => usages.push(u),
      );
    } catch (error) {
      console.error(`Neuerzeugung für Lernziel ${work.code} fehlgeschlagen:`, error);
      counts.failed++;
      streak++;
      if (streak >= 3 && counts.objectives === 0) {
        counts.aborted = true;
        break;
      }
      continue;
    }
    streak = 0;

    const lessonsSaved = await saveLessons(course, work, drafts.lessons, excerpts[0].sourceId, opts.actor);
    const questionsSaved = await saveQuestions(course, work, drafts.questions, excerpts);
    if (usages.length > 0) {
      await recordObjectiveGenerationCost(work.objectiveId, {
        model: usages.at(-1)?.model ?? LESSONS_MODEL,
        promptTokens: usages.reduce((sum, u) => sum + u.promptTokens, 0),
        completionTokens: usages.reduce((sum, u) => sum + u.completionTokens, 0),
        acceptedLessonCount: lessonsSaved,
        acceptedQuestionCount: questionsSaved,
      });
      const cost = usages.reduce<number | null>((sum, u) => {
        const c = estimateCostUsd(u.promptTokens, u.completionTokens, u.model, u.cachedTokens ?? 0);
        return sum !== null && c !== null ? sum + c : null;
      }, counts.costUsd ?? 0);
      counts.costUsd = cost;
    }
    if (lessonsSaved + questionsSaved > 0) {
      counts.objectives++;
      counts.lessons += lessonsSaved;
      counts.questions += questionsSaved;
    } else {
      counts.failed++;
    }
    opts.onProgress?.({ ...counts });
  }
  return counts;
}
