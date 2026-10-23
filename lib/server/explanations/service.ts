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
  solution: Localized<string> | null;
}

const ORDER: ExplanationKind[] = ["worked_example", "gapped_example", "analogy", "example"];

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
      solution: objectiveExplanations.solution,
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
  solution?: Localized<string>;
}): Promise<void> {
  if (input.content && (!input.content.de.trim() || !input.content.en.trim())) throw new InvalidExplanationError();
  if (input.solution && (!input.solution.de.trim() || !input.solution.en.trim())) throw new InvalidExplanationError();
  const set: Partial<typeof objectiveExplanations.$inferInsert> = { status: input.decision, reviewedByUserId: input.reviewerUserId, reviewedAt: new Date() };
  if (input.content) set.content = { de: input.content.de.trim(), en: input.content.en.trim() };
  if (input.solution) set.solution = { de: input.solution.de.trim(), en: input.solution.en.trim() };
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

export interface LadderStep {
  kind: "worked_example" | "gapped_example";
  content: Localized<string>;
  /** Nur beim Beispiel mit Lücken. */
  solution: Localized<string> | null;
}

export interface UnderstandHelp {
  /** „Vormachen, dann selbst machen“: gelöstes Beispiel, dann Beispiel mit Lücken, danach die eigene Aufgabe. */
  ladder: LadderStep[];
  /** Zusätzliche Sicht (Vergleich aus dem Alltag oder anderes Beispiel), falls freigegeben. */
  extra: { kind: "analogy" | "example"; content: Localized<string> } | null;
}

/**
 * Freigegebene Hilfen für die Verstehens-Aufgabe: die Leiter (gelöstes Beispiel → Beispiel mit Lücken) und eine zusätzliche Sicht.
 * Nach einer falsch beantworteten Aufgabe (`in_progress`) wird das gelöste Beispiel nicht noch einmal vorangestellt, wenn es das
 * Beispiel mit Lücken gibt. Nur `approved` wird je ausgegeben.
 */
export async function approvedHelpForQuestion(questionId: string, status: ConceptStruggleStatus): Promise<UnderstandHelp | null> {
  const db = getDb();
  const [q] = await db.select({ objectiveId: questions.objectiveId }).from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!q) return null;
  const rows = await db
    .select({ kind: objectiveExplanations.kind, content: objectiveExplanations.content, solution: objectiveExplanations.solution })
    .from(objectiveExplanations)
    .where(and(eq(objectiveExplanations.objectiveId, q.objectiveId), eq(objectiveExplanations.status, "approved"), inArray(objectiveExplanations.kind, ORDER)));
  if (rows.length === 0) return null;
  const by = new Map(rows.map((r) => [r.kind, r]));
  let ladder: LadderStep[] = (["worked_example", "gapped_example"] as const).flatMap((kind) => (by.has(kind) ? [{ kind, content: by.get(kind)!.content, solution: by.get(kind)!.solution ?? null }] : []));
  if (status === "in_progress" && ladder.length > 1) ladder = ladder.slice(1);
  const extraRow = by.get("analogy") ?? by.get("example");
  return { ladder, extra: extraRow ? { kind: extraRow.kind as "analogy" | "example", content: extraRow.content } : null };
}
