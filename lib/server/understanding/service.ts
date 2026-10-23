/** Verstehens-Modus (roadmap_didaktik Phase 9): Signale sammeln, erkennen, Wiederholen pausieren, Verstehens-Aufgabe, Abschluss. */
import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  conceptStruggles,
  concepts,
  itemConcepts,
  itemStates,
  itemVariants,
  questionOptions,
  questions,
  reviewLog,
  sections,
  simulationResults,
  studySessionItems,
  studySessions,
  type ConceptStruggleStatus,
  type StruggleSignal,
} from "@/lib/server/db/schema";
import { lastShownByQuestion } from "@/lib/server/variants/rotation";
import {
  DEFAULT_UNDERSTANDING_CONFIG,
  distinctVariantFailureSignal,
  evaluateStruggle,
  repeatedWrongOptionSignals,
  type RawSignal,
  type UnderstandingConfig,
} from "./rules";

const DAY_MS = 86_400_000;
const ACTIVE: ConceptStruggleStatus[] = ["detected", "in_progress"];

/** Konzepte der Items (über item_concept). */
async function conceptsOfItems(itemIds: string[]): Promise<Map<string, string[]>> {
  if (itemIds.length === 0) return new Map();
  const rows = await getDb().select({ itemId: itemConcepts.itemId, conceptId: itemConcepts.conceptId }).from(itemConcepts).where(inArray(itemConcepts.itemId, itemIds));
  const byConcept = new Map<string, string[]>();
  for (const r of rows) byConcept.set(r.conceptId, [...(byConcept.get(r.conceptId) ?? []), r.itemId]);
  return byConcept;
}

/** Alle Roh-Signale eines Konzepts aus den Daten der letzten Tage. */
async function collectSignals(userId: string, conceptItemIds: string[], now: Date, config: UnderstandingConfig): Promise<RawSignal[]> {
  const db = getDb();
  const from = new Date(now.getTime() - config.windowDays * DAY_MS);
  const signals: RawSignal[] = [];

  // Antworten in abgeschlossenen Sessions: falsch + sicher, immer dieselbe falsche Option
  const answers = await db
    .select({
      referenceId: studySessionItems.referenceId,
      variantQuestionId: studySessionItems.variantQuestionId,
      outcome: studySessionItems.outcome,
      confidence: studySessionItems.confidence,
      selectedOptionId: studySessionItems.selectedOptionId,
      at: studySessions.completedAt,
    })
    .from(studySessionItems)
    .innerJoin(studySessions, eq(studySessions.id, studySessionItems.sessionId))
    .where(
      and(
        eq(studySessions.userId, userId),
        eq(studySessions.status, "completed"),
        gte(studySessions.completedAt, from),
        eq(studySessionItems.referenceType, "question"),
        ne(studySessionItems.category, "understand"),
        inArray(studySessionItems.referenceId, conceptItemIds),
        eq(studySessionItems.outcome, "incorrect"),
      ),
    );
  for (const a of answers) {
    if (a.confidence === "sure" && a.at) signals.push({ kind: "sure_wrong", at: a.at, questionId: a.variantQuestionId ?? a.referenceId });
  }
  signals.push(
    ...repeatedWrongOptionSignals(
      answers.flatMap((a) => (a.selectedOptionId && a.at ? [{ questionId: a.variantQuestionId ?? a.referenceId, optionId: a.selectedOptionId, at: a.at }] : [])),
      config.repeatedWrongOptionMin,
    ),
  );

  // Fehler (Rating 1) bei mindestens 2 verschiedenen Fragen (Original und Varianten) des Konzepts
  const failures = await db
    .select({ itemId: reviewLog.itemId, variantQuestionId: reviewLog.variantQuestionId, at: reviewLog.timestampUtc })
    .from(reviewLog)
    .where(and(eq(reviewLog.userId, userId), eq(reviewLog.rawRating, 1), gte(reviewLog.timestampUtc, from), inArray(reviewLog.itemId, conceptItemIds)));
  const distinct = distinctVariantFailureSignal(failures.map((f) => ({ questionId: f.variantQuestionId ?? f.itemId, at: f.at })), config.distinctVariantFailuresMin);
  if (distinct) signals.push(distinct);

  // Item ohne Fortschritt: wiederholt Rating 1 und Stabilität bleibt klein
  const stalled = await db
    .select({ itemId: itemStates.itemId, lastReview: itemStates.lastReview })
    .from(itemStates)
    .where(and(eq(itemStates.userId, userId), inArray(itemStates.itemId, conceptItemIds), sql`${itemStates.stability} < ${config.stalledStabilityDays}`, gte(itemStates.lastReview, from)));
  if (stalled.length > 0) {
    const counts = await db
      .select({ itemId: reviewLog.itemId, n: sql<number>`count(*)::int` })
      .from(reviewLog)
      .where(and(eq(reviewLog.userId, userId), eq(reviewLog.rawRating, 1), inArray(reviewLog.itemId, stalled.map((s) => s.itemId))))
      .groupBy(reviewLog.itemId);
    const failed = new Set(counts.filter((c) => Number(c.n) >= config.stalledFailures).map((c) => c.itemId));
    for (const s of stalled) if (failed.has(s.itemId) && s.lastReview) signals.push({ kind: "stalled_item", at: s.lastReview });
  }

  // Simulation zum Lernziel nur mit mindestens 2 Hilfen gelöst
  const objectiveRows = await db.select({ objectiveId: questions.objectiveId }).from(questions).where(inArray(questions.id, conceptItemIds));
  const objectiveIds = [...new Set(objectiveRows.map((o) => o.objectiveId))];
  if (objectiveIds.length > 0) {
    const sims = await db
      .select({ at: simulationResults.lastSolvedAt })
      .from(simulationResults)
      .innerJoin(sections, eq(sections.id, simulationResults.sectionId))
      .where(and(eq(simulationResults.userId, userId), inArray(sections.objectiveId, objectiveIds), gte(simulationResults.bestHelps, config.simulationHelps), gte(simulationResults.lastSolvedAt, from)))
      .orderBy(desc(simulationResults.lastSolvedAt))
      .limit(1);
    if (sims[0]) signals.push({ kind: "simulation_help", at: sims[0].at });
  }
  return signals;
}

/**
 * Prüft die Konzepte der Items auf ein Muster und legt/aktualisiert `concept_struggle`. Gibt die Konzepte zurück, die neu im
 * Verstehens-Modus sind. Nach Lösung oder Ablehnung zählen nur neuere Signale.
 */
export async function detectStruggles(userId: string, itemIds: string[], now: Date = new Date(), config: UnderstandingConfig = DEFAULT_UNDERSTANDING_CONFIG): Promise<string[]> {
  const db = getDb();
  const byConcept = await conceptsOfItems([...new Set(itemIds)]);
  const detected: string[] = [];
  for (const [conceptId] of byConcept) {
    // Alle Items des Konzepts, nicht nur die eben beantworteten
    const all = await db.select({ itemId: itemConcepts.itemId }).from(itemConcepts).where(eq(itemConcepts.conceptId, conceptId));
    const [existing] = await db.select().from(conceptStruggles).where(and(eq(conceptStruggles.userId, userId), eq(conceptStruggles.conceptId, conceptId))).limit(1);
    const since = existing && !ACTIVE.includes(existing.status) ? (existing.resolvedAt ?? existing.updatedAt) : null;
    const evaluation = evaluateStruggle(await collectSignals(userId, all.map((a) => a.itemId), now, config), now, config, since);
    if (!evaluation.triggered) continue;
    if (existing && ACTIVE.includes(existing.status)) {
      await db.update(conceptStruggles).set({ signals: evaluation.signals, updatedAt: now }).where(eq(conceptStruggles.id, existing.id));
      continue;
    }
    await db
      .insert(conceptStruggles)
      .values({ userId, conceptId, status: "detected", signals: evaluation.signals, detectedAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [conceptStruggles.userId, conceptStruggles.conceptId], set: { status: "detected", signals: evaluation.signals, detectedAt: now, resolvedAt: null, updatedAt: now } });
    detected.push(conceptId);
  }
  return detected;
}

/** Items von Konzepten im Verstehens-Modus: kommen nicht als normale Wiederholung (nur Planungsschicht, FSRS-Zustand bleibt). */
export async function pausedItemIds(userId: string, certificationId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ itemId: itemConcepts.itemId })
    .from(conceptStruggles)
    .innerJoin(concepts, eq(concepts.id, conceptStruggles.conceptId))
    .innerJoin(itemConcepts, eq(itemConcepts.conceptId, conceptStruggles.conceptId))
    .where(and(eq(conceptStruggles.userId, userId), inArray(conceptStruggles.status, ACTIVE), eq(concepts.courseId, certificationId)));
  return new Set(rows.map((r) => r.itemId));
}

export interface UnderstandPlan {
  struggleId: string;
  itemId: string;
  variantQuestionId: string;
}

/**
 * Eine Verstehens-Aufgabe für das am längsten offene Konzept: eine neue (noch nicht oder am längsten nicht gezeigte) Variante
 * eines Items des Konzepts. Das Konzept bleibt pausiert, solange es keine Variante gibt.
 */
export async function planUnderstandTask(userId: string, certificationId: string): Promise<UnderstandPlan | null> {
  const db = getDb();
  const open = await db
    .select({ id: conceptStruggles.id, conceptId: conceptStruggles.conceptId })
    .from(conceptStruggles)
    .innerJoin(concepts, eq(concepts.id, conceptStruggles.conceptId))
    .where(and(eq(conceptStruggles.userId, userId), inArray(conceptStruggles.status, ACTIVE), eq(concepts.courseId, certificationId)))
    .orderBy(asc(conceptStruggles.detectedAt));
  for (const struggle of open) {
    const items = await db.select({ itemId: itemConcepts.itemId }).from(itemConcepts).where(eq(itemConcepts.conceptId, struggle.conceptId));
    const itemIds = items.map((i) => i.itemId);
    if (itemIds.length === 0) continue;
    const variants = await db
      .select({ itemId: itemVariants.itemId, questionId: itemVariants.questionId })
      .from(itemVariants)
      .innerJoin(questions, eq(questions.id, itemVariants.questionId))
      .where(and(inArray(itemVariants.itemId, itemIds), eq(itemVariants.active, true), ne(itemVariants.source, "original"), eq(questions.stale, false)))
      .orderBy(asc(itemVariants.itemId), asc(itemVariants.createdAt));
    if (variants.length === 0) continue;
    const lastShown = await lastShownByQuestion(userId, [...new Set(variants.map((v) => v.itemId))]);
    const time = (v: { itemId: string; questionId: string }) => lastShown.get(`${v.itemId}:${v.questionId}`)?.getTime() ?? -Infinity;
    const pick = variants.reduce((best, v) => (time(v) < time(best) ? v : best));
    return { struggleId: struggle.id, itemId: pick.itemId, variantQuestionId: pick.questionId };
  }
  return null;
}

/** Ergebnis der Verstehens-Aufgabe: richtig → `resolved` (danach normale Wiederholung), falsch → `in_progress` (nächste Variante). */
export async function recordUnderstandResults(results: Array<{ struggleId: string; isCorrect: boolean }>, now: Date = new Date()): Promise<void> {
  const db = getDb();
  for (const r of results) {
    await db
      .update(conceptStruggles)
      .set(r.isCorrect ? { status: "resolved", resolvedAt: now, updatedAt: now } : { status: "in_progress", updatedAt: now })
      .where(and(eq(conceptStruggles.id, r.struggleId), inArray(conceptStruggles.status, ACTIVE)));
  }
}

/** „Nicht jetzt“: Verstehens-Modus ablehnen. Die Aufgaben der Session entfallen, die Items kommen wieder normal dran. */
export async function declineUnderstanding(sessionId: string, userId: string, now: Date = new Date()): Promise<number> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(studySessions).where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId))).limit(1);
    if (!session || (session.status !== "planned" && session.status !== "in_progress")) return 0;
    const removed = await tx
      .delete(studySessionItems)
      .where(and(eq(studySessionItems.sessionId, sessionId), eq(studySessionItems.category, "understand"), sql`${studySessionItems.outcome} is null`))
      .returning({ struggleId: studySessionItems.conceptStruggleId });
    const ids = [...new Set(removed.map((r) => r.struggleId).filter((id): id is string => id !== null))];
    if (ids.length > 0) await tx.update(conceptStruggles).set({ status: "declined", updatedAt: now }).where(and(inArray(conceptStruggles.id, ids), eq(conceptStruggles.userId, userId)));
    return removed.length;
  });
}

export interface Confusion {
  optionText: { de: string; en: string };
  rationale: { de: string; en: string } | null;
}

/** „Häufige Verwechslung“: die wiederholt gewählte falsche Option samt Begründung (rationale), falls erkannt. */
export async function loadConfusion(signals: StruggleSignal[]): Promise<Confusion | null> {
  const repeated = [...signals].reverse().find((s) => s.kind === "repeated_wrong_option" && s.optionId);
  if (!repeated?.optionId) return null;
  const [option] = await getDb().select({ text: questionOptions.text, rationale: questionOptions.rationale }).from(questionOptions).where(eq(questionOptions.id, repeated.optionId)).limit(1);
  return option ? { optionText: option.text, rationale: option.rationale } : null;
}
