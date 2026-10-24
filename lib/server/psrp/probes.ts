/**
 * PSRP-HR Phase 7.2/7.3: Abfrage-Scheduler und Erfassung. Abfragen sehen für Lernende aus wie normale Aufgaben
 * (dieselbe Frage-UI, dasselbe Feedback, keine Kennzeichnung). Sie werden als normale Reviews des Original-Items
 * mit review_type = probe geloggt; das FSRS-Rating bleibt das rohe Rating der Antwort.
 */
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { AnswerConfidence } from "@/lib/types";
import { getDb } from "@/lib/server/db/client";
import {
  concepts,
  itemConcepts,
  itemStates,
  probeResults,
  probeVariants,
  reviewLog,
  userCalibration,
} from "@/lib/server/db/schema";
import { classifyCalibration, OVERALL_TOPIC, recomputeUserCalibration } from "./calibration";
import { DEFAULT_PSRP_CONFIG, type PsrpConfig } from "./config";
import { retrievability, type ItemState } from "./fsrs";
import { ratingFromOutcome, recordRatedReviews } from "./service";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export interface ProbeCandidate {
  variantId: string;
  questionId: string;
  conceptId: string;
  topicArea: string;
  isBottleneck: boolean;
  /** Vorhergesagte Abrufwahrscheinlichkeit des Konzepts (niedrigster Wert seiner Items). */
  predictedR: number | null;
  /** Anzahl bisheriger „Easy“-Bewertungen auf Items des Konzepts. */
  easyCount: number;
  /** Anzahl bisheriger Abfragen zu diesem Konzept. */
  probeCount: number;
  /** Letzte Verwendung dieser Variante (Abfrage), falls vorhanden. */
  variantLastUsed: Date | null;
  /** Letzter regulärer (nicht-Abfrage-)Review eines Items des Konzepts. */
  lastRegularReview: Date | null;
  /** Themengebiet mit belastbarer Überschätzung. */
  topicOverestimated: boolean;
}

/** Wie viele Abfragen eine Lektion/Session mit `taskCount` Aufgaben höchstens bekommt (höchstens 10 %). */
export function probeBudget(taskCount: number, config: PsrpConfig["probes"] = DEFAULT_PSRP_CONFIG.probes): number {
  return Math.max(0, Math.floor(taskCount * config.maxShare));
}

/**
 * `selectProbes`: gültige Kandidaten sind Bottleneck-Varianten, deren Konzept zwischen 0.80 und 0.90 vorhergesagter
 * Abrufwahrscheinlichkeit liegt, ohne Wiederholung derselben Variante innerhalb von 30 Tagen und ohne regulären
 * Review des Konzepts in den letzten 24 h. Reihenfolge: viele „Easy“, wenige Abfragen, Überschätzung zuerst.
 * Je Konzept höchstens eine Variante pro Auswahl.
 */
export function chooseProbes(
  candidates: ProbeCandidate[],
  taskCount: number,
  now: Date,
  config: PsrpConfig["probes"] = DEFAULT_PSRP_CONFIG.probes,
): ProbeCandidate[] {
  const budget = probeBudget(taskCount, config);
  if (budget === 0) return [];
  const eligible = candidates.filter((c) => {
    if (!c.isBottleneck || c.predictedR === null) return false;
    if (c.predictedR < config.minPredictedR || c.predictedR > config.maxPredictedR) return false;
    if (c.variantLastUsed && now.getTime() - c.variantLastUsed.getTime() < config.variantCooldownDays * DAY_MS) return false;
    if (c.lastRegularReview && now.getTime() - c.lastRegularReview.getTime() < config.conceptCooldownHours * HOUR_MS) return false;
    return true;
  });
  const score = (c: ProbeCandidate) => c.easyCount - 0.5 * c.probeCount + (c.topicOverestimated ? 1 + config.overestimateBoost * 4 : 0);
  const ordered = [...eligible].sort((a, b) => score(b) - score(a) || a.variantId.localeCompare(b.variantId));
  const chosen: ProbeCandidate[] = [];
  const usedConcepts = new Set<string>();
  for (const c of ordered) {
    if (chosen.length >= budget) break;
    if (usedConcepts.has(c.conceptId)) continue;
    usedConcepts.add(c.conceptId);
    chosen.push(c);
  }
  return chosen;
}

/** Fügt Abfragen so in die Aufgabenfolge ein, dass nie zwei direkt aufeinander folgen und keine an erster Stelle steht. */
export function interleaveProbes<T>(tasks: T[], probes: T[]): T[] {
  if (probes.length === 0) return tasks;
  const result = [...tasks];
  const usable = Math.min(probes.length, Math.floor(tasks.length / 2));
  if (usable === 0) return tasks;
  const step = tasks.length / usable;
  for (let i = 0; i < usable; i++) {
    const position = Math.min(result.length, Math.max(1, Math.floor(step * i + step / 2)) + i);
    result.splice(position, 0, probes[i]);
  }
  return result;
}

/** Kandidaten eines Kurses für einen Nutzer aus der Datenbank. */
export async function loadProbeCandidates(userId: string, certificationId: string, now: Date): Promise<ProbeCandidate[]> {
  const db = getDb();
  const variants = await db
    .select({
      variantId: probeVariants.id,
      questionId: probeVariants.questionId,
      conceptId: probeVariants.conceptId,
      isBottleneck: probeVariants.isBottleneck,
      topicArea: concepts.topicArea,
    })
    .from(probeVariants)
    .innerJoin(concepts, eq(concepts.id, probeVariants.conceptId))
    .where(eq(concepts.courseId, certificationId));
  const usable = variants.filter((v) => v.questionId !== null);
  if (usable.length === 0) return [];
  const conceptIds = [...new Set(usable.map((v) => v.conceptId))];

  const itemRows = await db
    .select({
      conceptId: itemConcepts.conceptId,
      itemId: itemConcepts.itemId,
      stability: itemStates.stability,
      difficulty: itemStates.difficulty,
      reps: itemStates.reps,
      lapses: itemStates.lapses,
      fsrsState: itemStates.fsrsState,
      lastReview: itemStates.lastReview,
      due: itemStates.due,
    })
    .from(itemConcepts)
    .leftJoin(itemStates, and(eq(itemStates.itemId, itemConcepts.itemId), eq(itemStates.userId, userId)))
    .where(inArray(itemConcepts.conceptId, conceptIds));
  const rByConcept = new Map<string, number>();
  for (const row of itemRows) {
    if (row.stability === null || row.difficulty === null || !row.lastReview) continue;
    const state: ItemState = {
      stability: row.stability, difficulty: row.difficulty, reps: row.reps ?? 0, lapses: row.lapses ?? 0,
      fsrsState: row.fsrsState ?? 2, lastReview: row.lastReview, due: row.due ?? now,
    };
    const r = retrievability(state, now);
    if (r === null) continue;
    rByConcept.set(row.conceptId, Math.min(rByConcept.get(row.conceptId) ?? 1, r));
  }

  const logRows = await db
    .select({
      conceptId: itemConcepts.conceptId,
      reviewType: reviewLog.reviewType,
      rating: reviewLog.rawRating,
      at: reviewLog.timestampUtc,
      variantId: reviewLog.probeVariantId,
    })
    .from(reviewLog)
    .innerJoin(itemConcepts, eq(itemConcepts.itemId, reviewLog.itemId))
    .where(and(eq(reviewLog.userId, userId), inArray(itemConcepts.conceptId, conceptIds)));
  const easy = new Map<string, number>();
  const probes = new Map<string, number>();
  const lastRegular = new Map<string, Date>();
  const variantUsed = new Map<string, Date>();
  for (const row of logRows) {
    if (row.reviewType === "probe") {
      probes.set(row.conceptId, (probes.get(row.conceptId) ?? 0) + 1);
      if (row.variantId && (!variantUsed.has(row.variantId) || row.at > variantUsed.get(row.variantId)!)) variantUsed.set(row.variantId, row.at);
      continue;
    }
    if (row.rating === 4) easy.set(row.conceptId, (easy.get(row.conceptId) ?? 0) + 1);
    if (!lastRegular.has(row.conceptId) || row.at > lastRegular.get(row.conceptId)!) lastRegular.set(row.conceptId, row.at);
  }

  const over = await overestimatedTopics(userId);
  return usable.map((v) => ({
    variantId: v.variantId,
    questionId: v.questionId as string,
    conceptId: v.conceptId,
    topicArea: v.topicArea,
    isBottleneck: v.isBottleneck,
    predictedR: rByConcept.get(v.conceptId) ?? null,
    easyCount: easy.get(v.conceptId) ?? 0,
    probeCount: probes.get(v.conceptId) ?? 0,
    variantLastUsed: variantUsed.get(v.variantId) ?? null,
    lastRegularReview: lastRegular.get(v.conceptId) ?? null,
    topicOverestimated: over.has(v.topicArea),
  }));
}

export async function selectProbes(userId: string, certificationId: string, taskCount: number, now = new Date()): Promise<ProbeCandidate[]> {
  return chooseProbes(await loadProbeCandidates(userId, certificationId, now), taskCount, now);
}

/** Themengebiete mit belastbarer Überschätzung (Grundlage der Priorisierung, Phase 7.4). */
export async function overestimatedTopics(userId: string): Promise<Set<string>> {
  const rows = await getDb().select().from(userCalibration).where(eq(userCalibration.userId, userId));
  return new Set(
    rows
      .filter((r) => r.topicArea !== OVERALL_TOPIC && classifyCalibration({ bias: r.bias, ciLow: r.ciLow, ciHigh: r.ciHigh, n: r.nProbes }) === "overestimates")
      .map((r) => r.topicArea),
  );
}

/** Frage-ID → Variante, soweit die Frage eine Abfragevariante ist. */
export async function probeVariantsByQuestion(questionIds: string[]) {
  if (questionIds.length === 0) return new Map<string, typeof probeVariants.$inferSelect>();
  const rows = await getDb().select().from(probeVariants).where(inArray(probeVariants.questionId, questionIds));
  return new Map(rows.filter((r) => r.questionId).map((r) => [r.questionId as string, r]));
}

/**
 * Erfasst die Antwort auf eine Abfrage: Review des Original-Items (review_type = probe), Messwerte für die
 * Kalibrierung (nur bei Bottleneck-Varianten) und Neuberechnung des Kalibrierungswerts.
 */
export async function recordProbeAnswer(params: {
  userId: string;
  variant: typeof probeVariants.$inferSelect;
  isCorrect: boolean;
  confidence?: AnswerConfidence | null;
  responseTimeMs?: number | null;
  sessionId?: string;
  now?: Date;
  /** Falsch: nur protokollieren (verspätet synchronisierte Antwort, Ereignis zu alt). */
  applyState?: boolean;
}): Promise<void> {
  const db = getDb();
  const { variant, userId } = params;
  const itemId = variant.sourceItemId;
  if (!itemId) return;
  const now = params.now ?? new Date();

  // Letztes Selbst-Rating (regulärer Review) des Items vor dieser Abfrage.
  const [previous] = await db
    .select({ rating: reviewLog.rawRating })
    .from(reviewLog)
    .where(and(eq(reviewLog.userId, userId), eq(reviewLog.itemId, itemId), ne(reviewLog.reviewType, "probe")))
    .orderBy(desc(reviewLog.timestampUtc))
    .limit(1);

  const { sessionId } = await recordRatedReviews(
    userId,
    [{ itemId, rawRating: ratingFromOutcome(params.isCorrect, params.confidence), responseTimeMs: params.responseTimeMs, reviewType: "probe", probeVariantId: variant.id, applyState: params.applyState }],
    { sessionId: params.sessionId, now },
  );
  if (!variant.isBottleneck) return;

  const [entry] = await db
    .select({ id: reviewLog.id, predictedR: reviewLog.predictedR })
    .from(reviewLog)
    .where(and(eq(reviewLog.userId, userId), eq(reviewLog.sessionId, sessionId), eq(reviewLog.probeVariantId, variant.id)))
    .orderBy(desc(reviewLog.timestampUtc))
    .limit(1);
  if (!entry) return;
  const [concept] = await db.select({ topicArea: concepts.topicArea }).from(concepts).where(eq(concepts.id, variant.conceptId)).limit(1);

  // Populations-Erfolgsquote der Variante aus den Abfragen anderer Nutzer (erst ab 5 Beobachtungen).
  const [population] = await db
    .select({ n: sql<number>`count(*)::int`, ok: sql<number>`coalesce(sum(case when ${probeResults.success} then 1 else 0 end), 0)::int` })
    .from(probeResults)
    .where(and(eq(probeResults.variantId, variant.id), ne(probeResults.userId, userId)));
  await db.insert(probeResults).values({
    reviewLogId: entry.id,
    userId,
    conceptId: variant.conceptId,
    variantId: variant.id,
    topicArea: concept?.topicArea ?? "",
    // Ohne FSRS-Vorhersage (erstes Review des Items) gilt der Mittelpunkt des Abfragekorridors.
    predictedR: entry.predictedR ?? (DEFAULT_PSRP_CONFIG.probes.minPredictedR + DEFAULT_PSRP_CONFIG.probes.maxPredictedR) / 2,
    selfRating: previous?.rating ?? null,
    populationRate: population && population.n >= 5 ? population.ok / population.n : null,
    success: params.isCorrect,
  });
  await recomputeUserCalibration(userId);
}

