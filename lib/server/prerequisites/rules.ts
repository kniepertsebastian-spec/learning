/** Voraussetzungen im Konzeptmodell (roadmap_didaktik 9.3): reine Regeln ohne DB. */

/** Höchstens so viele Voraussetzungen je Konzept (hält den Grundlagen-Check kurz). */
export const MAX_PREREQUISITES = 3;
/** Fragen im Grundlagen-Check (2-3 laut Roadmap). */
export const MAX_DIAGNOSTIC_QUESTIONS = 3;

export type Edge = readonly [conceptId: string, requiresId: string];

/** Würde die Kante `concept → requires` einen Kreis erzeugen? (`requires` setzt direkt oder indirekt `concept` voraus.) */
export function wouldCreateCycle(edges: readonly Edge[], conceptId: string, requiresId: string): boolean {
  if (conceptId === requiresId) return true;
  const next = new Map<string, string[]>();
  for (const [c, r] of edges) next.set(c, [...(next.get(c) ?? []), r]);
  const seen = new Set<string>();
  const stack = [requiresId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === conceptId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(next.get(current) ?? []));
  }
  return false;
}

/**
 * Aus Vorschlägen die zulässigen Kanten: nur bekannte Konzepte, keine Selbstbezüge, keine Kreise, höchstens `MAX_PREREQUISITES` je
 * Konzept, keine Dubletten. `existing` sind bereits gespeicherte Kanten (jeder Status), sie zählen für Kreise und Obergrenze mit.
 */
export function acceptEdges(
  proposals: Array<{ conceptId: string; requiresIds: string[] }>,
  knownConcepts: ReadonlySet<string>,
  existing: readonly Edge[] = [],
): Edge[] {
  const edges: Edge[] = [...existing];
  const accepted: Edge[] = [];
  for (const p of proposals) {
    if (!knownConcepts.has(p.conceptId)) continue;
    for (const requiresId of p.requiresIds) {
      if (!knownConcepts.has(requiresId)) continue;
      if (edges.some(([c, r]) => c === p.conceptId && r === requiresId)) continue;
      if (edges.filter(([c]) => c === p.conceptId).length >= MAX_PREREQUISITES) break;
      if (wouldCreateCycle(edges, p.conceptId, requiresId)) continue;
      edges.push([p.conceptId, requiresId]);
      accepted.push([p.conceptId, requiresId]);
    }
  }
  return accepted;
}

export interface DiagnosticResult {
  requiresConceptId: string;
  isCorrect: boolean;
}

/** Die schwache Voraussetzung: die erste falsch beantwortete (in der Reihenfolge der Fragen); null, wenn alle richtig sind. */
export function weakestPrerequisite(results: readonly DiagnosticResult[]): string | null {
  return results.find((r) => !r.isCorrect)?.requiresConceptId ?? null;
}
