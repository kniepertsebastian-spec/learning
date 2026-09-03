import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certificationSources, domains, objectives } from "@/lib/server/db/schema";
import type { BlueprintExtraction } from "@/lib/server/ai/service";
import { getBlueprintDraft, validateBlueprintDraft } from "./blueprint";

export type CertificationSource = typeof certificationSources.$inferSelect;

/** R1.3: geworfen, wenn eine Freigabe (noch) nicht möglich ist - fehlende
 * Quelle/Draft, blockierende Validierungsfehler, oder die Quelle ist bereits
 * freigegeben/ersetzt. */
export class BlueprintNotApprovableError extends Error {}

export interface BlueprintApplyResult {
  domainsCreated: number;
  domainsUpdated: number;
  objectivesCreated: number;
  objectivesUpdated: number;
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
  content: BlueprintExtraction,
): Promise<BlueprintApplyResult> {
  const db = getDb();
  const result: BlueprintApplyResult = {
    domainsCreated: 0,
    domainsUpdated: 0,
    objectivesCreated: 0,
    objectivesUpdated: 0,
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
        if (existing) {
          await tx
            .update(objectives)
            .set({ title: draftObjective.title, description: draftObjective.description })
            .where(eq(objectives.id, existing.id));
          result.objectivesUpdated++;
        } else {
          await tx.insert(objectives).values({
            domainId: domainRow.id,
            code: draftObjective.code,
            title: draftObjective.title,
            description: draftObjective.description,
          });
          result.objectivesCreated++;
        }
      }
    }
  });

  return result;
}

/**
 * R1.3: "Freigabe mit Admin-ID und Zeitpunkt protokollieren" - blockiert bei
 * blockierenden Validierungsfehlern (siehe validateBlueprintDraft), wendet
 * den Merge in die echten Tabellen an und setzt certification_sources.status
 * auf "approved" mit approvedBy/approvedAt. Ab dann greift
 * BlueprintLockedError in blueprint.ts für weitere Extraktionen/Korrekturen.
 */
export async function approveBlueprintDraft(
  sourceId: string,
  userId: string,
): Promise<{ source: CertificationSource; applyResult: BlueprintApplyResult }> {
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

  const applyResult = await applyBlueprintDraft(source.certificationId, content);

  const [updatedSource] = await db
    .update(certificationSources)
    .set({ status: "approved", approvedBy: userId, approvedAt: new Date() })
    .where(eq(certificationSources.id, sourceId))
    .returning();

  return { source: updatedSource, applyResult };
}
