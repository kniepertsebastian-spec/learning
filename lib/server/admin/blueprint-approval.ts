import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certificationSources,
  domains,
  lessons,
  objectiveSourceRefs,
  objectives,
  questions,
  sections,
  sourceChunks,
} from "@/lib/server/db/schema";
import type { BlueprintExtraction } from "@/lib/server/ai/service";
import { getBlueprintDraft, validateBlueprintDraft } from "./blueprint";
import {
  diffBlueprintAgainstObjectives,
  type BlueprintDiff,
  type ExistingObjectiveSnapshot,
} from "./blueprint-diff";

export type CertificationSource = typeof certificationSources.$inferSelect;

/** R1.3: geworfen, wenn eine Freigabe (noch) nicht möglich ist - fehlende
 * Quelle/Draft, blockierende Validierungsfehler, oder die Quelle ist bereits
 * freigegeben/ersetzt. */
export class BlueprintNotApprovableError extends Error {}

/**
 * R1.5 (roadmap.md): aktueller (freigegebener) Objective-Stand einer
 * Zertifizierung, als Vergleichsgrundlage für diffBlueprintAgainstObjectives()
 * - sowohl für die Vorschau (previewBlueprintDiff) als auch für die
 * stale-Markierung beim Freigeben einer neuen Quellenversion.
 */
export async function getExistingObjectiveSnapshot(
  certificationId: string,
): Promise<ExistingObjectiveSnapshot[]> {
  const rows = await getDb()
    .select({
      id: objectives.id,
      domainName: domains.name,
      code: objectives.code,
      title: objectives.title,
      description: objectives.description,
    })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certificationId));
  return rows;
}

/**
 * R1.5: Vorschau, was eine Freigabe an den Domains/Objectives ändern würde -
 * ohne irgendetwas zu schreiben. Nutzbar unabhängig davon, ob die Quelle
 * tatsächlich als "ersetzt eine andere" markiert ist (supersedesSourceId),
 * damit ein Admin den Effekt vor der Freigabe sehen kann.
 */
export async function previewBlueprintDiff(sourceId: string): Promise<BlueprintDiff> {
  const draft = await getBlueprintDraft(sourceId);
  if (!draft) {
    throw new BlueprintNotApprovableError("Für diese Quelle liegt noch kein Blueprint-Vorschlag vor.");
  }
  const [source] = await getDb()
    .select({ certificationId: certificationSources.certificationId })
    .from(certificationSources)
    .where(eq(certificationSources.id, sourceId))
    .limit(1);
  if (!source) throw new BlueprintNotApprovableError(`Quelle ${sourceId} nicht gefunden.`);

  const existing = await getExistingObjectiveSnapshot(source.certificationId);
  return diffBlueprintAgainstObjectives(existing, draft.content as unknown as BlueprintExtraction);
}

export interface BlueprintApplyResult {
  domainsCreated: number;
  domainsUpdated: number;
  objectivesCreated: number;
  objectivesUpdated: number;
  sourceRefsCreated: number;
}

/**
 * R1.4: extrahiert Seitenzahlen aus einem Locator-Text wie er von
 * generateBlueprintDraft() geliefert wird ("S. 4", "S. 4-5", "S. 4, 7").
 * Reine Funktion, damit sie ohne DB testbar ist. Erkennt Bereiche ("4-5")
 * zuerst und expandiert sie, danach einzelne Zahlen im Rest des Texts -
 * ein unplausibel großer Bereich (> 50 Seiten) wird NICHT expandiert (sonst
 * würden versehentlich hunderte Chunks an ein Objective gehängt), seine
 * beiden Randzahlen werden aber wie gewöhnliche Einzelseiten übernommen.
 */
export function parseLocatorPageNumbers(locator: string): number[] {
  const pages = new Set<number>();
  let remaining = locator;

  for (const match of locator.matchAll(/(\d+)\s*[-–]\s*(\d+)/g)) {
    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2], 10);
    if (Number.isFinite(start) && Number.isFinite(end) && start <= end && end - start < 50) {
      for (let page = start; page <= end; page++) pages.add(page);
      remaining = remaining.replace(match[0], " ");
    }
  }

  for (const match of remaining.matchAll(/\d+/g)) {
    const page = Number.parseInt(match[0], 10);
    if (Number.isFinite(page)) pages.add(page);
  }

  return [...pages].sort((a, b) => a - b);
}

/**
 * R1.3: übernimmt einen freigegebenen Blueprint-Vorschlag in die echten
 * domains/objectives-Tabellen, die der Rest der App (Curriculum-/Lesson-
 * Generierung, Lernansicht) tatsächlich liest. Matched Domains per
 * (getrimmtem, klein geschriebenem) Namen und Objectives per Code innerhalb
 * ihrer Domain - bei Treffer Update, sonst Insert. Löscht NIE etwas: eine
 * Domain/ein Objective, das in `content` fehlt, bleibt unangetastet, damit
 * ein unvollständiger oder nur teilweise erkannter Blueprint nicht
 * versehentlich bestehende, funktionierende Kursdaten entfernt.
 */
export async function applyBlueprintDraft(
  certificationId: string,
  sourceId: string,
  content: BlueprintExtraction,
): Promise<BlueprintApplyResult> {
  const db = getDb();
  const result: BlueprintApplyResult = {
    domainsCreated: 0,
    domainsUpdated: 0,
    objectivesCreated: 0,
    objectivesUpdated: 0,
    sourceRefsCreated: 0,
  };

  await db.transaction(async (tx) => {
    const existingDomains = await tx
      .select()
      .from(domains)
      .where(eq(domains.certificationId, certificationId));
    const domainByName = new Map(
      existingDomains.map((domain) => [domain.name.trim().toLowerCase(), domain]),
    );
    let nextOrderNum = existingDomains.reduce((max, d) => Math.max(max, d.orderNum), 0) + 1;

    for (const draftDomain of content.domains) {
      const key = draftDomain.name.trim().toLowerCase();
      const weightPercent =
        draftDomain.weightPercent === null ? null : draftDomain.weightPercent.toString();
      let domainRow = domainByName.get(key);

      if (domainRow) {
        [domainRow] = await tx
          .update(domains)
          .set({ weightPercent })
          .where(eq(domains.id, domainRow.id))
          .returning();
        result.domainsUpdated++;
      } else {
        [domainRow] = await tx
          .insert(domains)
          .values({
            certificationId,
            orderNum: nextOrderNum++,
            name: draftDomain.name,
            weightPercent,
          })
          .returning();
        domainByName.set(key, domainRow);
        result.domainsCreated++;
      }

      const existingObjectives = await tx
        .select()
        .from(objectives)
        .where(eq(objectives.domainId, domainRow.id));
      const objectiveByCode = new Map(
        existingObjectives.map((objective) => [objective.code.trim().toLowerCase(), objective]),
      );

      for (const draftObjective of draftDomain.objectives) {
        const objectiveKey = draftObjective.code.trim().toLowerCase();
        const existing = objectiveByCode.get(objectiveKey);
        let objectiveId: string;
        if (existing) {
          await tx
            .update(objectives)
            .set({ title: draftObjective.title, description: draftObjective.description })
            .where(eq(objectives.id, existing.id));
          objectiveId = existing.id;
          result.objectivesUpdated++;
        } else {
          const [inserted] = await tx
            .insert(objectives)
            .values({
              domainId: domainRow.id,
              code: draftObjective.code,
              title: draftObjective.title,
              description: draftObjective.description,
            })
            .returning();
          objectiveId = inserted.id;
          result.objectivesCreated++;
        }

        // R1.4: "jedes Feld eine Seiten-/Abschnittsreferenz" -> jetzt eine
        // echte Relation statt nur Text im Draft-JSON.
        const pageNumbers = parseLocatorPageNumbers(draftObjective.locator);
        if (pageNumbers.length === 0) continue;

        const chunks = await tx
          .select({ id: sourceChunks.id })
          .from(sourceChunks)
          .where(
            and(eq(sourceChunks.sourceId, sourceId), inArray(sourceChunks.pageNumber, pageNumbers)),
          );
        for (const chunk of chunks) {
          const [inserted] = await tx
            .insert(objectiveSourceRefs)
            .values({
              objectiveId,
              sourceChunkId: chunk.id,
              locator: draftObjective.locator,
              confidence: draftObjective.confidence.toString(),
            })
            .onConflictDoNothing({
              target: [objectiveSourceRefs.objectiveId, objectiveSourceRefs.sourceChunkId],
            })
            .returning();
          if (inserted) result.sourceRefsCreated++;
        }
      }
    }
  });

  return result;
}

export interface StaleMarkResult {
  lessonsMarkedStale: number;
  questionsMarkedStale: number;
}

/**
 * R1.5: markiert Lessons/Fragen betroffener (geänderter oder entfernter)
 * Objectives als stale, statt sie unverändert als aktuell gültig
 * auszugeben. "Betroffen" heißt hier bewusst nur geändert/entfernt - ein neu
 * hinzugekommenes Objective hat noch keine Lessons/Fragen, die stale sein
 * könnten.
 */
async function markStaleContentForDiff(diff: BlueprintDiff): Promise<StaleMarkResult> {
  const affectedObjectiveIds = [
    ...new Set([
      ...diff.changedObjectives.map((o) => o.id),
      ...diff.removedObjectives.map((o) => o.id),
    ]),
  ];
  if (affectedObjectiveIds.length === 0) {
    return { lessonsMarkedStale: 0, questionsMarkedStale: 0 };
  }

  const db = getDb();
  const affectedSections = await db
    .select({ id: sections.id })
    .from(sections)
    .where(inArray(sections.objectiveId, affectedObjectiveIds));

  const staleLessons =
    affectedSections.length > 0
      ? await db
          .update(lessons)
          .set({ reviewStatus: "stale" })
          .where(
            inArray(
              lessons.sectionId,
              affectedSections.map((s) => s.id),
            ),
          )
          .returning({ id: lessons.id })
      : [];

  const staleQuestions = await db
    .update(questions)
    .set({ stale: true })
    .where(inArray(questions.objectiveId, affectedObjectiveIds))
    .returning({ id: questions.id });

  return { lessonsMarkedStale: staleLessons.length, questionsMarkedStale: staleQuestions.length };
}

/**
 * R1.3/R1.5: "Freigabe mit Admin-ID und Zeitpunkt protokollieren" - blockiert
 * bei blockierenden Validierungsfehlern (siehe validateBlueprintDraft),
 * wendet den Merge in die echten Tabellen an und setzt
 * certification_sources.status auf "approved" mit approvedBy/approvedAt. Ab
 * dann greift BlueprintLockedError in blueprint.ts für weitere Extraktionen/
 * Korrekturen.
 *
 * Ist `supersedesSourceId` auf der Quelle gesetzt (R1.5: "Neue Ausgabe eines
 * Blueprints als neue Version importieren"), wird VOR dem Merge der Diff
 * gegen den aktuellen Stand berechnet, danach betroffene Lessons/Fragen als
 * stale markiert und die ersetzte Quelle auf "superseded" gesetzt.
 */
export async function approveBlueprintDraft(
  sourceId: string,
  userId: string,
): Promise<{
  source: CertificationSource;
  applyResult: BlueprintApplyResult;
  diff: BlueprintDiff | null;
  staleResult: StaleMarkResult | null;
}> {
  const db = getDb();
  const [source] = await db
    .select()
    .from(certificationSources)
    .where(eq(certificationSources.id, sourceId))
    .limit(1);
  if (!source) throw new BlueprintNotApprovableError(`Quelle ${sourceId} nicht gefunden.`);
  if (source.status === "approved") {
    throw new BlueprintNotApprovableError("Diese Quelle ist bereits freigegeben.");
  }
  if (source.status === "superseded") {
    throw new BlueprintNotApprovableError("Diese Quelle wurde ersetzt und kann nicht mehr freigegeben werden.");
  }

  const draft = await getBlueprintDraft(sourceId);
  if (!draft) {
    throw new BlueprintNotApprovableError("Für diese Quelle liegt noch kein Blueprint-Vorschlag vor.");
  }

  const content = draft.content as unknown as BlueprintExtraction;
  const { errors } = validateBlueprintDraft(content);
  if (errors.length > 0) {
    throw new BlueprintNotApprovableError(
      `Freigabe durch Validierungsfehler blockiert: ${errors.join(" ")}`,
    );
  }

  let supersededSource: CertificationSource | null = null;
  if (source.supersedesSourceId) {
    const [candidate] = await db
      .select()
      .from(certificationSources)
      .where(eq(certificationSources.id, source.supersedesSourceId))
      .limit(1);
    if (!candidate || candidate.status !== "approved") {
      throw new BlueprintNotApprovableError(
        "Die als 'ersetzt' markierte Quelle ist nicht (mehr) freigegeben - Freigabe abgebrochen.",
      );
    }
    supersededSource = candidate;
  }

  // Diff VOR dem Merge berechnen, solange "existing" noch den unveränderten
  // Stand zeigt - applyBlueprintDraft überschreibt Titel/Beschreibung direkt.
  const diff = supersededSource
    ? diffBlueprintAgainstObjectives(await getExistingObjectiveSnapshot(source.certificationId), content)
    : null;

  const applyResult = await applyBlueprintDraft(source.certificationId, source.id, content);

  const staleResult = diff ? await markStaleContentForDiff(diff) : null;

  if (supersededSource) {
    await db
      .update(certificationSources)
      .set({ status: "superseded" })
      .where(eq(certificationSources.id, supersededSource.id));
  }

  const [updatedSource] = await db
    .update(certificationSources)
    .set({ status: "approved", approvedBy: userId, approvedAt: new Date() })
    .where(eq(certificationSources.id, sourceId))
    .returning();

  return { source: updatedSource, applyResult, diff, staleResult };
}
