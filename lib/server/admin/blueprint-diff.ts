import type { BlueprintExtraction } from "@/lib/server/ai/service";

export interface ExistingObjectiveSnapshot {
  id: string;
  domainName: string;
  code: string;
  title: string;
  description: string | null;
}

export interface ChangedObjective {
  id: string;
  domainName: string;
  code: string;
  field: "title" | "description";
  oldValue: string;
  newValue: string;
}

export interface ObjectiveRef {
  domainName: string;
  code: string;
  title: string;
}

export interface RemovedObjective extends ObjectiveRef {
  id: string;
}

export interface BlueprintDiff {
  addedDomains: string[];
  removedDomains: string[];
  addedObjectives: ObjectiveRef[];
  removedObjectives: RemovedObjective[];
  changedObjectives: ChangedObjective[];
}

function key(domainName: string, code: string): string {
  return `${domainName.trim().toLowerCase()}::${code.trim().toLowerCase()}`;
}

/**
 * R1.5 (roadmap.md): "Added/changed/removed Domains und Objectives als Diff
 * darstellen" - vergleicht den aktuellen (freigegebenen) Stand einer
 * Zertifizierung mit einem neuen Blueprint-Draft. Reine Funktion, damit sie
 * ohne DB testbar ist und sich sowohl für eine Vorschau (vor der Freigabe)
 * als auch für die stale-Markierung (approveBlueprintDraft, wenn
 * supersedesSourceId gesetzt ist) eignet - dort wird sie VOR dem eigentlichen
 * Merge (applyBlueprintDraft) aufgerufen, damit "existing" noch den
 * unveränderten Stand zeigt.
 */
export function diffBlueprintAgainstObjectives(
  existing: ExistingObjectiveSnapshot[],
  newContent: BlueprintExtraction,
): BlueprintDiff {
  const existingDomainNames = new Set(existing.map((o) => o.domainName.trim().toLowerCase()));
  const newDomainNames = new Set(newContent.domains.map((d) => d.name.trim().toLowerCase()));

  const addedDomains = newContent.domains
    .map((d) => d.name)
    .filter((name) => !existingDomainNames.has(name.trim().toLowerCase()));

  const removedDomainNames = new Set(
    existing
      .map((o) => o.domainName)
      .filter((name) => !newDomainNames.has(name.trim().toLowerCase())),
  );
  const removedDomains = [...removedDomainNames];

  const existingByKey = new Map(existing.map((o) => [key(o.domainName, o.code), o]));
  const newByKey = new Map<string, { domainName: string; code: string; title: string; description: string }>();
  for (const domain of newContent.domains) {
    for (const objective of domain.objectives) {
      newByKey.set(key(domain.name, objective.code), {
        domainName: domain.name,
        code: objective.code,
        title: objective.title,
        description: objective.description,
      });
    }
  }

  const addedObjectives: ObjectiveRef[] = [...newByKey.entries()]
    .filter(([objectiveKey]) => !existingByKey.has(objectiveKey))
    .map(([, o]) => ({ domainName: o.domainName, code: o.code, title: o.title }));

  const removedObjectives: RemovedObjective[] = [...existingByKey.entries()]
    .filter(([objectiveKey]) => !newByKey.has(objectiveKey))
    .map(([, o]) => ({ id: o.id, domainName: o.domainName, code: o.code, title: o.title }));

  const changedObjectives: ChangedObjective[] = [];
  for (const [objectiveKey, newObjective] of newByKey.entries()) {
    const existingObjective = existingByKey.get(objectiveKey);
    if (!existingObjective) continue;

    if (existingObjective.title.trim() !== newObjective.title.trim()) {
      changedObjectives.push({
        id: existingObjective.id,
        domainName: newObjective.domainName,
        code: newObjective.code,
        field: "title",
        oldValue: existingObjective.title,
        newValue: newObjective.title,
      });
    }
    if ((existingObjective.description ?? "").trim() !== newObjective.description.trim()) {
      changedObjectives.push({
        id: existingObjective.id,
        domainName: newObjective.domainName,
        code: newObjective.code,
        field: "description",
        oldValue: existingObjective.description ?? "",
        newValue: newObjective.description,
      });
    }
  }

  return { addedDomains, removedDomains, addedObjectives, removedObjectives, changedObjectives };
}
