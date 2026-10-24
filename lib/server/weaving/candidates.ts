/**
 * Schwächen in spätere Lektionen einweben (roadmap_didaktik Phase 10, Flag `woven_reviews`): wählt für den Lektionstest bis zu
 * zwei fällige oder schwache Items früherer Lektionen, deren Konzept mit der aktuellen Lektion verbunden ist (gemeinsames Konzept,
 * freigegebene Voraussetzung oder gleiches Themengebiet). Gezeigt wird bevorzugt eine Variante. Eingewebte Fragen zählen nicht
 * für das Ergebnis der Lektion; sie laufen nur als Review (`interleaved`) in das Gedächtnismodell.
 */
import { and, asc, eq, inArray, ne, notExists, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { conceptPrerequisites, concepts, domains, itemConcepts, itemStates, itemVariants, objectives, questionOptions, questions, sections } from "@/lib/server/db/schema";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { retrievability, type ItemState } from "@/lib/server/psrp/fsrs";
import { pausedItemIds } from "@/lib/server/understanding/service";
import { chooseSessionVariants } from "@/lib/server/variants/rotation";
import { isWeakOrDue, rankCandidates, wovenCount, type WovenCandidate } from "@/lib/weaving/rules";

export interface WovenQuestion {
  id: string;
  /** Original-Item, an dem der FSRS-Zustand hängt; `id` ist die gezeigte Frage (Original oder Variante). */
  itemId: string;
  woven: true;
  question: { de: string; en: string };
  explanation: { de: string; en: string };
  options: Array<{ id: string; text: { de: string; en: string }; orderNum: number; isCorrect: boolean; rationale: { de: string; en: string } | null }>;
  difficulty: string | null;
  sourceReference: string | null;
}

export async function pickWovenQuestions(userId: string, sectionId: string, regularCount: number, now: Date = new Date()): Promise<WovenQuestion[]> {
  if (!isFeatureEnabled("woven_reviews", userId) || regularCount <= 0) return [];
  const db = getDb();
  const [section] = await db
    .select({ objectiveId: sections.objectiveId, courseId: domains.certificationId })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(sections.id, sectionId))
    .limit(1);
  if (!section) return [];

  // Konzepte der aktuellen Lektion (über die Fragen ihres Lernziels), ihre Voraussetzungen und Themengebiete.
  const own = await db
    .select({ conceptId: itemConcepts.conceptId, topicArea: concepts.topicArea })
    .from(itemConcepts)
    .innerJoin(questions, eq(questions.id, itemConcepts.itemId))
    .innerJoin(concepts, eq(concepts.id, itemConcepts.conceptId))
    .where(eq(questions.objectiveId, section.objectiveId));
  if (own.length === 0) return [];
  const ownConcepts = [...new Set(own.map((r) => r.conceptId))];
  const topicAreas = [...new Set(own.map((r) => r.topicArea))];
  const prerequisites = await db
    .select({ requires: conceptPrerequisites.requiresConceptId })
    .from(conceptPrerequisites)
    .where(and(inArray(conceptPrerequisites.conceptId, ownConcepts), eq(conceptPrerequisites.status, "approved")));
  const tierOne = new Set([...ownConcepts, ...prerequisites.map((p) => p.requires)]);

  const paused = await pausedItemIds(userId, section.courseId);
  const rows = await db
    .select({ itemId: itemConcepts.itemId, conceptId: itemConcepts.conceptId, topicArea: concepts.topicArea, state: itemStates })
    .from(itemConcepts)
    .innerJoin(concepts, eq(concepts.id, itemConcepts.conceptId))
    .innerJoin(questions, eq(questions.id, itemConcepts.itemId))
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .innerJoin(itemStates, and(eq(itemStates.itemId, questions.id), eq(itemStates.userId, userId)))
    .where(
      and(
        eq(domains.certificationId, section.courseId),
        ne(questions.objectiveId, section.objectiveId),
        eq(questions.stale, false),
        eq(questions.probeOnly, false),
        eq(questions.answerFormat, "choice"), // eingewebt werden nur Auswahlfragen
        // Varianten sind keine eigenen Items: nur Originale kommen als Kandidat in Frage.
        notExists(db.select({ one: sql`1` }).from(itemVariants).where(and(eq(itemVariants.questionId, questions.id), ne(itemVariants.itemId, questions.id)))),
      ),
    );

  const byItem = new Map<string, WovenCandidate>();
  for (const row of rows) {
    if (paused.has(row.itemId)) continue; // Verstehens-Modus: nie einweben
    const tier = tierOne.has(row.conceptId) ? 1 : topicAreas.includes(row.topicArea) ? 2 : null;
    if (!tier) continue;
    const state: ItemState = {
      stability: row.state.stability,
      difficulty: row.state.difficulty,
      reps: row.state.reps,
      lapses: row.state.lapses,
      fsrsState: row.state.fsrsState,
      lastReview: row.state.lastReview,
      due: row.state.due,
    };
    const r = retrievability(state, now);
    if (!isWeakOrDue({ due: state.due, retrievability: r }, now)) continue;
    const existing = byItem.get(row.itemId);
    if (!existing || tier < existing.tier) byItem.set(row.itemId, { itemId: row.itemId, tier, due: state.due, retrievability: r });
  }

  const ranked = rankCandidates([...byItem.values()]);
  const take = wovenCount(regularCount, ranked.length);
  const picked = ranked.slice(0, take);
  if (picked.length === 0) return [];

  const variants = await chooseSessionVariants(userId, picked.map((p) => ({ itemId: p.itemId, isNew: false })), now);
  const shownIds = picked.map((p) => variants.get(p.itemId) ?? p.itemId);
  const [questionRows, optionRows] = await Promise.all([
    db.select().from(questions).where(inArray(questions.id, shownIds)),
    db.select().from(questionOptions).where(inArray(questionOptions.questionId, shownIds)).orderBy(asc(questionOptions.orderNum)),
  ]);
  return picked.flatMap((p, i) => {
    const q = questionRows.find((row) => row.id === shownIds[i]);
    const options = optionRows.filter((o) => o.questionId === shownIds[i]);
    if (!q || options.length < 2 || !options.some((o) => o.isCorrect)) return [];
    return [
      {
        id: q.id,
        itemId: p.itemId,
        woven: true as const,
        question: q.question,
        explanation: q.explanation,
        options: options.map((o) => ({ id: o.id, text: o.text, orderNum: o.orderNum, isCorrect: o.isCorrect, rationale: o.rationale ?? null })),
        difficulty: q.difficulty,
        sourceReference: q.sourceReference,
      },
    ];
  });
}
