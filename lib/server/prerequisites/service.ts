/** Voraussetzungen: Freigabe in der Werkstatt, Grundlagen-Check im Verstehens-Modus, Brückenlektion. Nur Freigegebenes wirkt. */
import { aliasedTable, and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  conceptPrerequisites,
  conceptStruggles,
  concepts,
  itemConcepts,
  lessons,
  questions,
  sections,
  type PrerequisiteStatus,
} from "@/lib/server/db/schema";
import { MAX_DIAGNOSTIC_QUESTIONS, weakestPrerequisite } from "./rules";

export class PrerequisiteNotFoundError extends Error {}

const ACTIVE = ["detected", "in_progress"] as const;

export interface DraftPrerequisite {
  id: string;
  conceptName: string;
  requiresName: string;
  topicArea: string;
}

export async function listDraftPrerequisites(certificationId: string): Promise<DraftPrerequisite[]> {
  const requires = aliasedTable(concepts, "requires_concept");
  return getDb()
    .select({ id: conceptPrerequisites.id, conceptName: concepts.name, requiresName: requires.name, topicArea: concepts.topicArea })
    .from(conceptPrerequisites)
    .innerJoin(concepts, eq(concepts.id, conceptPrerequisites.conceptId))
    .innerJoin(requires, eq(requires.id, conceptPrerequisites.requiresConceptId))
    .where(and(eq(concepts.courseId, certificationId), eq(conceptPrerequisites.status, "draft")))
    .orderBy(asc(concepts.topicArea), asc(concepts.name), asc(requires.name));
}

export async function prerequisiteCounts(certificationId: string): Promise<Record<PrerequisiteStatus, number>> {
  const rows = await getDb()
    .select({ status: conceptPrerequisites.status })
    .from(conceptPrerequisites)
    .innerJoin(concepts, eq(concepts.id, conceptPrerequisites.conceptId))
    .where(eq(concepts.courseId, certificationId));
  const counts: Record<PrerequisiteStatus, number> = { draft: 0, approved: 0, rejected: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}

/** Werkstatt: Vorschlag freigeben oder verwerfen. Nur Entwürfe lassen sich entscheiden. */
export async function reviewPrerequisite(input: { id: string; reviewerUserId: string; decision: Extract<PrerequisiteStatus, "approved" | "rejected"> }): Promise<void> {
  const result = await getDb()
    .update(conceptPrerequisites)
    .set({ status: input.decision, reviewedByUserId: input.reviewerUserId, reviewedAt: new Date() })
    .where(and(eq(conceptPrerequisites.id, input.id), eq(conceptPrerequisites.status, "draft")))
    .returning({ id: conceptPrerequisites.id });
  if (result.length === 0) throw new PrerequisiteNotFoundError();
}

export interface PrereqCheckPlan {
  struggleId: string;
  /** Eine Frage je Voraussetzung, höchstens `MAX_DIAGNOSTIC_QUESTIONS`. */
  items: Array<{ requiresConceptId: string; itemId: string }>;
}

/** Eine normale (nicht veraltete, nicht nur-Abfrage) Frage des Konzepts; stabil die erste nach Kennung. */
async function pickItemOfConcept(conceptId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ itemId: itemConcepts.itemId })
    .from(itemConcepts)
    .innerJoin(questions, eq(questions.id, itemConcepts.itemId))
    .where(and(eq(itemConcepts.conceptId, conceptId), eq(questions.stale, false), eq(questions.probeOnly, false)))
    .orderBy(asc(questions.humanId))
    .limit(1);
  return row?.itemId ?? null;
}

/**
 * Grundlagen-Check für das am längsten offene Konzept, dessen Check noch aussteht: 2-3 kurze Fragen zu den freigegebenen Voraussetzungen.
 * Hat ein Konzept keine freigegebene Voraussetzung mit Frage, gilt der Check als erledigt und das nächste Konzept ist dran.
 */
export async function planPrereqCheck(userId: string, certificationId: string, now: Date = new Date()): Promise<PrereqCheckPlan | null> {
  const db = getDb();
  const open = await db
    .select({ id: conceptStruggles.id, conceptId: conceptStruggles.conceptId })
    .from(conceptStruggles)
    .innerJoin(concepts, eq(concepts.id, conceptStruggles.conceptId))
    .where(and(eq(conceptStruggles.userId, userId), inArray(conceptStruggles.status, [...ACTIVE]), isNull(conceptStruggles.prereqCheckedAt), eq(concepts.courseId, certificationId)))
    .orderBy(asc(conceptStruggles.detectedAt));
  for (const struggle of open) {
    const required = await db
      .select({ requiresConceptId: conceptPrerequisites.requiresConceptId })
      .from(conceptPrerequisites)
      .where(and(eq(conceptPrerequisites.conceptId, struggle.conceptId), eq(conceptPrerequisites.status, "approved")))
      .orderBy(asc(conceptPrerequisites.createdAt));
    const items: PrereqCheckPlan["items"] = [];
    for (const r of required) {
      if (items.length >= MAX_DIAGNOSTIC_QUESTIONS) break;
      const itemId = await pickItemOfConcept(r.requiresConceptId);
      if (itemId) items.push({ requiresConceptId: r.requiresConceptId, itemId });
    }
    if (items.length > 0) return { struggleId: struggle.id, items };
    await db.update(conceptStruggles).set({ prereqCheckedAt: now, updatedAt: now }).where(eq(conceptStruggles.id, struggle.id));
  }
  return null;
}

/** Erste Lektion (nach Reihenfolge) mit Text zu einem Konzept: über die Lernziele seiner Fragen. */
async function bridgeSectionOfConcept(conceptId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ sectionId: sections.id })
    .from(itemConcepts)
    .innerJoin(questions, eq(questions.id, itemConcepts.itemId))
    .innerJoin(sections, eq(sections.objectiveId, questions.objectiveId))
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .where(eq(itemConcepts.conceptId, conceptId))
    .orderBy(asc(sections.orderNum))
    .limit(1);
  return row?.sectionId ?? null;
}

/**
 * Ergebnis des Grundlagen-Checks: der Check ist erledigt; war eine Voraussetzung schwach, merkt sich das Konzept die Brückenlektion
 * (wird vor der Verstehens-Aufgabe gezeigt). Danach geht es mit dem Ausgangskonzept weiter.
 */
export async function recordPrereqResults(struggleId: string, results: Array<{ questionId: string; isCorrect: boolean }>, now: Date = new Date()): Promise<string | null> {
  const db = getDb();
  const [struggle] = await db.select({ conceptId: conceptStruggles.conceptId }).from(conceptStruggles).where(eq(conceptStruggles.id, struggleId)).limit(1);
  if (!struggle) return null;
  const required = await db
    .select({ requiresConceptId: conceptPrerequisites.requiresConceptId })
    .from(conceptPrerequisites)
    .where(and(eq(conceptPrerequisites.conceptId, struggle.conceptId), eq(conceptPrerequisites.status, "approved")));
  const requiredIds = required.map((r) => r.requiresConceptId);
  const mapping = requiredIds.length > 0 && results.length > 0
    ? await db.select({ itemId: itemConcepts.itemId, conceptId: itemConcepts.conceptId }).from(itemConcepts).where(and(inArray(itemConcepts.conceptId, requiredIds), inArray(itemConcepts.itemId, results.map((r) => r.questionId))))
    : [];
  const diagnostic = results.flatMap((r) => {
    const concept = mapping.find((m) => m.itemId === r.questionId)?.conceptId;
    return concept ? [{ requiresConceptId: concept, isCorrect: r.isCorrect }] : [];
  });
  const weak = weakestPrerequisite(diagnostic);
  const bridgeSectionId = weak ? await bridgeSectionOfConcept(weak) : null;
  await db
    .update(conceptStruggles)
    .set({ prereqCheckedAt: now, bridgeConceptId: weak && bridgeSectionId ? weak : null, bridgeSectionId, updatedAt: now })
    .where(eq(conceptStruggles.id, struggleId));
  return weak;
}

export interface BridgeView {
  conceptName: string;
  sectionId: string;
  title: { de: string; en: string };
}

export async function loadBridges(struggleIds: string[]): Promise<Map<string, BridgeView>> {
  if (struggleIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: conceptStruggles.id, conceptName: concepts.name, sectionId: sections.id, title: sections.title })
    .from(conceptStruggles)
    .innerJoin(concepts, eq(concepts.id, conceptStruggles.bridgeConceptId))
    .innerJoin(sections, eq(sections.id, conceptStruggles.bridgeSectionId))
    .where(inArray(conceptStruggles.id, struggleIds));
  return new Map(rows.map((r) => [r.id, { conceptName: r.conceptName, sectionId: r.sectionId, title: r.title }]));
}

