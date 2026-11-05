import { and, asc, eq, inArray, sql, type AnyColumn } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { GoogleGenAI } from "@google/genai";
import type { AIUsage } from "@/lib/ai/generate";
import { recordQuestionRevision, recordSectionRevision } from "@/lib/server/course-editor/service";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, lessons, objectives, questionOptions, questions, sections } from "@/lib/server/db/schema";
import { translatableAnswerTexts, withTranslatedAnswerTexts, type AnswerData } from "@/lib/questions/answer-formats";
import { estimateCostUsd } from "@/lib/server/admin/ai-cost";
import { AiAccessUnavailableError, clientForOrganization } from "@/lib/server/internal-courses/ai-client";
import type { Locale, Localized } from "@/lib/types";
import {
  chunkObjective,
  createChunkTranslator,
  translationDirection,
  type ChunkTranslator,
  type QuestionItem,
  type SectionItem,
  type TranslationChunk,
  type TranslationResponse,
} from "./translate";
import { withAiCost } from "@/lib/server/admin/ai-ledger";

/** Gleichzeitige KI-Aufrufe je Kurs. */
const PARALLEL = 3;
/** Schlagen die ersten Aufrufe alle fehl (Schlüssel, Kontingent, Modellname), bricht der Lauf ab statt den ganzen Kurs zu versuchen. */
const ABORT_AFTER_FAILURES = 3;

export type TranslationCounts = { total: number; done: number; failed: number; aborted: boolean };

/** Ein Text gilt als noch nicht übersetzt, solange beide Sprachfelder gleich sind (so legt die Generierung ihn ab). */
const untranslated = <T>(value: Localized<T> | null | undefined) => Boolean(value) && JSON.stringify(value!.de) === JSON.stringify(value!.en);

/** Setzt nur das Feld der Zielsprache; das Original bleibt unberührt, auch wenn es sich inzwischen geändert hätte. */
function setLocale(column: AnyColumn, target: Locale, value: unknown) {
  return sql`jsonb_set(${column}, ${`{${target}}`}::text[], ${JSON.stringify(value)}::jsonb)`;
}

async function loadChunks(certificationId: string, source: Locale): Promise<TranslationChunk[]> {
  const db = getDb();
  const objectiveRows = await db
    .select({ id: objectives.id, title: objectives.title })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certificationId))
    .orderBy(asc(domains.orderNum), asc(objectives.code));
  if (objectiveRows.length === 0) return [];
  const objectiveIds = objectiveRows.map((o) => o.id);

  const [sectionRows, questionRows] = await Promise.all([
    db
      .select({
        sectionId: sections.id,
        objectiveId: sections.objectiveId,
        title: sections.title,
        lessonId: lessons.id,
        content: lessons.content,
        keyTakeaways: lessons.keyTakeaways,
        examFocusPoints: lessons.examFocusPoints,
        cheatSheet: lessons.cheatSheet,
        outdated: lessons.translationOutdated,
      })
      .from(sections)
      .innerJoin(lessons, eq(lessons.sectionId, sections.id))
      .where(inArray(sections.objectiveId, objectiveIds))
      .orderBy(asc(sections.orderNum)),
    // Veraltete Fragen sehen Lernende nicht mehr (nur alte Verläufe): sie zu übersetzen kostet nur.
    db
      .select({ id: questions.id, objectiveId: questions.objectiveId, question: questions.question, explanation: questions.explanation, outdated: questions.translationOutdated, answerFormat: questions.answerFormat, answerData: questions.answerData })
      .from(questions)
      .where(and(inArray(questions.objectiveId, objectiveIds), eq(questions.stale, false)))
      .orderBy(asc(questions.humanId)),
  ]);
  const optionRows = questionRows.length
    ? await db
        .select({ id: questionOptions.id, questionId: questionOptions.questionId, text: questionOptions.text, rationale: questionOptions.rationale })
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, questionRows.map((q) => q.id)))
        .orderBy(asc(questionOptions.orderNum))
    : [];
  const optionsByQuestion = new Map<string, typeof optionRows>();
  for (const o of optionRows) optionsByQuestion.set(o.questionId, [...(optionsByQuestion.get(o.questionId) ?? []), o]);

  const chunks: TranslationChunk[] = [];
  for (const objective of objectiveRows) {
    const sectionItems: SectionItem[] = sectionRows
      .filter((s) => s.objectiveId === objective.id)
      // Veraltet (Kurssprache per KI geändert): die ganze Lektion neu übersetzen, auch Felder, die schon verschieden sind.
      .filter((s) => s.outdated || untranslated(s.title) || untranslated(s.content) || untranslated(s.keyTakeaways) || untranslated(s.examFocusPoints) || untranslated(s.cheatSheet))
      .map((s, i) => ({
        key: `s${i + 1}`,
        sectionId: s.sectionId,
        lessonId: s.lessonId,
        title: s.title[source],
        content: s.content[source],
        keyTakeaways: s.keyTakeaways?.[source] ?? null,
        examFocusPoints: s.examFocusPoints?.[source] ?? null,
        cheatSheet: s.cheatSheet?.[source] || null,
      }));
    const questionItems: QuestionItem[] = questionRows
      .filter((q) => q.objectiveId === objective.id)
      // Bei den neuen Antwortformaten laufen die Texte der Lösung (Schritte, Begriffe, Aussagen) wie Optionen mit; ihre Kennung steht in `id`.
      .map((q) => ({ ...q, options: [...(optionsByQuestion.get(q.id) ?? []), ...translatableAnswerTexts(q.answerFormat, q.answerData).map((a) => ({ id: `ans:${a.key}`, text: a.text, rationale: null }))] }))
      .filter((q) => q.outdated || untranslated(q.question) || untranslated(q.explanation) || q.options.some((o) => untranslated(o.text) || untranslated(o.rationale)))
      .map((q, i) => ({
        key: `q${i + 1}`,
        questionId: q.id,
        question: q.question[source],
        explanation: q.explanation[source],
        options: q.options.map((o) => ({ id: o.id, text: o.text[source], rationale: o.rationale?.[source] || null })),
      }));
    chunks.push(...chunkObjective(objective.title, sectionItems, questionItems));
  }
  return chunks;
}

async function saveChunk(certificationId: string, chunk: TranslationChunk, result: TranslationResponse, target: Locale): Promise<void> {
  const byKeyS = new Map(result.sections.map((s) => [s.key, s]));
  const byKeyQ = new Map(result.questions.map((q) => [q.key, q]));
  // Der alte Stand (meist die Kopie der Ausgangssprache) bleibt als Revision, falls eine Übersetzung danebenliegt.
  const actor = { userId: null, origin: "translation" as const, note: `Übersetzung nach ${target}` };
  await getDb().transaction(async (tx) => {
    for (const s of chunk.sections) {
      const t = byKeyS.get(s.key)!;
      await recordSectionRevision(tx, certificationId, s.sectionId, actor);
      await tx.update(sections).set({ title: setLocale(sections.title, target, t.title) }).where(eq(sections.id, s.sectionId));
      await tx
        .update(lessons)
        .set({
          content: setLocale(lessons.content, target, t.content),
          ...(s.keyTakeaways ? { keyTakeaways: setLocale(lessons.keyTakeaways, target, t.keyTakeaways) } : {}),
          ...(s.examFocusPoints ? { examFocusPoints: setLocale(lessons.examFocusPoints, target, t.examFocusPoints) } : {}),
          ...(s.cheatSheet && t.cheatSheet ? { cheatSheet: setLocale(lessons.cheatSheet, target, t.cheatSheet) } : {}),
          translationOutdated: false,
          // Neuer Stand für Offline-Pakete (deren Version richtet sich nach lessons.updatedAt).
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, s.lessonId));
    }
    for (const q of chunk.questions) {
      const t = byKeyQ.get(q.key)!;
      await recordQuestionRevision(tx, certificationId, q.questionId, actor);
      await tx
        .update(questions)
        .set({ question: setLocale(questions.question, target, t.question), explanation: setLocale(questions.explanation, target, t.explanation), translationOutdated: false })
        .where(eq(questions.id, q.questionId));
      const answerTexts: Record<string, string> = {};
      for (const [i, o] of q.options.entries()) {
        const to = t.options[i];
        if (o.id.startsWith("ans:")) {
          answerTexts[o.id.slice(4)] = to.text;
          continue;
        }
        await tx
          .update(questionOptions)
          .set({ text: setLocale(questionOptions.text, target, to.text), ...(o.rationale && to.rationale ? { rationale: setLocale(questionOptions.rationale, target, to.rationale) } : {}) })
          .where(eq(questionOptions.id, o.id));
      }
      if (Object.keys(answerTexts).length > 0) {
        const [row] = await tx.select({ format: questions.answerFormat, data: questions.answerData }).from(questions).where(eq(questions.id, q.questionId)).limit(1);
        if (row?.data) await tx.update(questions).set({ answerData: withTranslatedAnswerTexts(row.format, row.data as AnswerData, target, answerTexts) }).where(eq(questions.id, q.questionId));
      }
    }
  });
}

/** Der KI-Zugang für den Kurs: bei internen Kursen der der Firma, sonst der der Plattform. */
export async function clientFor(cert: { kind: string; ownerOrganizationId: string | null }): Promise<GoogleGenAI | undefined> {
  if (cert.kind === "internal") {
    if (!cert.ownerOrganizationId) throw new AiAccessUnavailableError("Interner Kurs ohne Firma.");
    return clientForOrganization(cert.ownerOrganizationId);
  }
  if (!process.env.GEMINI_API_KEY) throw new AiAccessUnavailableError("GEMINI_API_KEY ist nicht gesetzt.");
  return undefined;
}

async function updateStatus(certificationId: string, values: PgUpdateSetSource<typeof certifications>) {
  await getDb().update(certifications).set(values).where(eq(certifications.id, certificationId));
}

/**
 * Übersetzt alle noch einsprachigen Texte eines Kurses in die zweite Sprache und hält Status und Fortschritt am Kurs
 * fest. Wiederholbar: ein zweiter Lauf übersetzt nur, was noch fehlt (z. B. nach einem Abbruch oder neu erzeugten
 * Lektionen). `translator` ersetzt in Tests den KI-Aufruf.
 */
export function translateCourse(certificationId: string, translator?: ChunkTranslator): Promise<TranslationCounts> {
  return withAiCost({ source: "translation", certificationId }, () => translateCourseRun(certificationId, translator));
}

async function translateCourseRun(certificationId: string, translator?: ChunkTranslator): Promise<TranslationCounts> {
  const [cert] = await getDb()
    .select({ id: certifications.id, kind: certifications.kind, ownerOrganizationId: certifications.ownerOrganizationId, contentLocale: certifications.contentLocale, translationCostUsd: certifications.translationCostUsd })
    .from(certifications)
    .where(eq(certifications.id, certificationId))
    .limit(1);
  if (!cert) throw new Error(`Kurs ${certificationId} nicht gefunden.`);

  const { source, target } = translationDirection(cert.contentLocale);
  const counts: TranslationCounts = { total: 0, done: 0, failed: 0, aborted: false };
  let costUsd: number | null = null;
  const onUsage = (u: AIUsage) => {
    const cost = estimateCostUsd(u.promptTokens, u.completionTokens, u.model, u.cachedTokens);
    if (cost !== null) costUsd = (costUsd ?? 0) + cost;
  };

  try {
    const chunks = await loadChunks(certificationId, source);
    counts.total = chunks.length;
    if (chunks.length === 0) {
      await updateStatus(certificationId, { translationStatus: "done", translationMessage: "Alle Inhalte liegen in beiden Sprachen vor.", translatedAt: new Date(), translationProcessed: 0, translationTotal: 0 });
      return counts;
    }
    const translate = translator ?? createChunkTranslator(await clientFor(cert), onUsage);
    await updateStatus(certificationId, { translationStatus: "running", translationMessage: `0/${counts.total} Teile übersetzt …`, translationProcessed: 0, translationTotal: counts.total });
    // Fortschritt nach jedem Teil, damit der Balken in der Admin-Übersicht gleichmäßig wächst.
    const reportProgress = () =>
      updateStatus(certificationId, {
        // Parallele Teile können ihre Meldung in anderer Reihenfolge schreiben: der Balken läuft nie zurück.
        translationProcessed: sql`greatest(${certifications.translationProcessed}, ${counts.done + counts.failed})`,
        translationMessage: `${counts.done}/${counts.total} Teile übersetzt …`,
      });

    let consecutiveFailures = 0;
    let firstError: string | null = null;
    for (let i = 0; i < chunks.length && !counts.aborted; i += PARALLEL) {
      await Promise.all(
        chunks.slice(i, i + PARALLEL).map(async (chunk) => {
          try {
            await saveChunk(certificationId, chunk, await translate(chunk, source, target), target);
            counts.done++;
            consecutiveFailures = 0;
            await reportProgress();
          } catch (error) {
            counts.failed++;
            consecutiveFailures++;
            firstError ??= error instanceof Error ? error.message : String(error);
            console.error(`Übersetzung (${certificationId}) eines Teils fehlgeschlagen:`, error);
            await reportProgress();
          }
        }),
      );
      if (consecutiveFailures >= ABORT_AFTER_FAILURES && counts.done === 0) counts.aborted = true;
    }

    const ok = counts.failed === 0 && !counts.aborted;
    const failedMessage = counts.aborted
      ? `Abgebrochen: die ersten Aufrufe sind alle fehlgeschlagen (${String(firstError).slice(0, 300)}).`
      : `${counts.done}/${counts.total} Teile übersetzt, ${counts.failed} fehlgeschlagen. Ein neuer Lauf übersetzt nur den Rest.`;
    await updateStatus(certificationId, {
      translationStatus: ok ? "done" : "failed",
      translationMessage: ok ? `${counts.done} Teile nach ${target === "en" ? "Englisch" : "Deutsch"} übersetzt.` : failedMessage,
      ...(ok ? { translatedAt: new Date() } : {}),
      ...(costUsd !== null ? { translationCostUsd: String((Number(cert.translationCostUsd) || 0) + costUsd) } : {}),
      // Neuer Stand für Offline-Pakete, auch für übersetzte Fragen.
      ...(counts.done > 0 ? { updatedAt: new Date() } : {}),
    });
    return counts;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateStatus(certificationId, { translationStatus: "failed", translationMessage: message.slice(0, 500) });
    throw error;
  }
}
