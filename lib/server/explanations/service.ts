/** Alternativerklärungen: Freigabe in der Werkstatt und Auswahl für den Verstehens-Modus. Nur freigegebene werden Lernenden gezeigt. */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  domains,
  objectiveExplanations,
  objectives,
  questions,
  type ConceptStruggleStatus,
  type ExplanationKind,
  type ExplanationStatus,
} from "@/lib/server/db/schema";
import type { Localized } from "@/lib/types";

export class ExplanationNotFoundError extends Error {}
export class InvalidExplanationError extends Error {}

export interface DraftExplanation {
  id: string;
  objectiveId: string;
  objectiveCode: string;
  objectiveTitle: string;
  kind: ExplanationKind;
  content: Localized<string>;
}

const ORDER: ExplanationKind[] = ["worked_example", "analogy", "example"];

/** Entwürfe eines Kurses für die Werkstatt, nach Lernziel sortiert. */
export async function listDraftExplanations(certificationId: string): Promise<DraftExplanation[]> {
  const rows = await getDb()
    .select({
      id: objectiveExplanations.id,
      objectiveId: objectiveExplanations.objectiveId,
      objectiveCode: objectives.code,
      objectiveTitle: objectives.title,
      kind: objectiveExplanations.kind,
      content: objectiveExplanations.content,
    })
    .from(objectiveExplanations)
    .innerJoin(objectives, eq(objectives.id, objectiveExplanations.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(domains.certificationId, certificationId), eq(objectiveExplanations.status, "draft")))
    .orderBy(asc(domains.orderNum), asc(objectives.code), asc(objectiveExplanations.kind));
  return rows;
}

/**
 * Werkstatt: freigeben oder verwerfen, optional mit überarbeitetem Text (beide Sprachen). Nur Entwürfe lassen sich entscheiden;
 * eine Freigabe ist die einzige Stelle, an der eine Erklärung für Lernende sichtbar wird.
 */
export async function reviewExplanation(input: {
  id: string;
  reviewerUserId: string;
  decision: Extract<ExplanationStatus, "approved" | "rejected">;
  content?: Localized<string>;
}): Promise<void> {
  if (input.content && (!input.content.de.trim() || !input.content.en.trim())) throw new InvalidExplanationError();
  const set: Partial<typeof objectiveExplanations.$inferInsert> = { status: input.decision, reviewedByUserId: input.reviewerUserId, reviewedAt: new Date() };
  if (input.content) set.content = { de: input.content.de.trim(), en: input.content.en.trim() };
  const result = await getDb()
    .update(objectiveExplanations)
    .set(set)
    .where(and(eq(objectiveExplanations.id, input.id), eq(objectiveExplanations.status, "draft")))
    .returning({ id: objectiveExplanations.id });
  if (result.length === 0) throw new ExplanationNotFoundError();
}

/** Anzahl nach Status je Kurs (für die Werkstatt-Übersicht). */
export async function explanationCounts(certificationId: string): Promise<Record<ExplanationStatus, number>> {
  const rows = await getDb()
    .select({ status: objectiveExplanations.status })
    .from(objectiveExplanations)
    .innerJoin(objectives, eq(objectives.id, objectiveExplanations.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certificationId));
  const counts: Record<ExplanationStatus, number> = { draft: 0, approved: 0, rejected: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}

/**
 * Freigegebene Alternativerklärung für die Frage im Verstehens-Modus: beim ersten Versuch (`detected`) die erste Art
 * (gelöstes Beispiel), nach einer falsch beantworteten Aufgabe (`in_progress`) die nächste. Gibt es nur eine, bleibt es dabei.
 */
export async function approvedExplanationForQuestion(
  questionId: string,
  status: ConceptStruggleStatus,
): Promise<{ kind: ExplanationKind; content: Localized<string> } | null> {
  const db = getDb();
  const [q] = await db.select({ objectiveId: questions.objectiveId }).from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!q) return null;
  const rows = await db
    .select({ kind: objectiveExplanations.kind, content: objectiveExplanations.content })
    .from(objectiveExplanations)
    .where(and(eq(objectiveExplanations.objectiveId, q.objectiveId), eq(objectiveExplanations.status, "approved"), inArray(objectiveExplanations.kind, ORDER)));
  if (rows.length === 0) return null;
  const sorted = rows.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return sorted[status === "in_progress" ? Math.min(1, sorted.length - 1) : 0];
}
