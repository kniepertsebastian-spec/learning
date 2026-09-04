import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { objectiveSourceRefs, sourceChunks } from "@/lib/server/db/schema";

export interface ObjectiveSourceExcerpt {
  chunkId: string;
  /** z. B. "S. 4" - identisch zum Locator, den das Modell in
   * generateGroundedLessonsAndQuestionsForObjective() zitieren soll. */
  locator: string;
  text: string;
  sourceId: string;
}

/**
 * R1.4 (roadmap.md): alle Quellenausschnitte, die für ein freigegebenes
 * Objective hinterlegt sind (objective_source_refs, befüllt beim Freigeben
 * in lib/server/admin/blueprint-approval.ts). Mehrere Refs, die auf denselben
 * Chunk zeigen, werden dedupliziert, damit derselbe Textausschnitt nicht
 * doppelt in den Prompt wandert.
 */
export async function getObjectiveSourceExcerpts(
  objectiveId: string,
): Promise<ObjectiveSourceExcerpt[]> {
  const refs = await getDb()
    .select({
      chunkId: sourceChunks.id,
      pageNumber: sourceChunks.pageNumber,
      content: sourceChunks.content,
      sourceId: sourceChunks.sourceId,
    })
    .from(objectiveSourceRefs)
    .innerJoin(sourceChunks, eq(objectiveSourceRefs.sourceChunkId, sourceChunks.id))
    .where(eq(objectiveSourceRefs.objectiveId, objectiveId))
    .orderBy(sourceChunks.pageNumber);

  const seenChunkIds = new Set<string>();
  const excerpts: ObjectiveSourceExcerpt[] = [];
  for (const ref of refs) {
    if (seenChunkIds.has(ref.chunkId)) continue;
    seenChunkIds.add(ref.chunkId);
    excerpts.push({
      chunkId: ref.chunkId,
      locator: `S. ${ref.pageNumber}`,
      text: ref.content,
      sourceId: ref.sourceId,
    });
  }
  return excerpts;
}
