/**
 * Häufung (roadmap_didaktik Phase 9.4): scheitern viele Lernende am selben Konzept, landet es automatisch in der Prüfliste der
 * Werkstatt (`ContentReportQueue`, Grund `concept_struggle`) - mit der am häufigsten gewählten falschen Option. Anonym: nur Zahlen.
 */
import { and, desc, eq, inArray, sql, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  conceptStruggles,
  concepts,
  contentReports,
  itemConcepts,
  itemStates,
  questionOptions,
  studySessionItems,
  type ContentReportDetail,
} from "@/lib/server/db/schema";
import { DEFAULT_HOTSPOT_CONFIG, isHotspot, type HotspotConfig } from "./rules";

/** Prüft die Konzepte und legt/aktualisiert je eine offene Meldung. Gibt die Anzahl neu angelegter Meldungen zurück. */
export async function flagConceptHotspots(conceptIds: string[], config: HotspotConfig = DEFAULT_HOTSPOT_CONFIG): Promise<number> {
  const db = getDb();
  let created = 0;
  for (const conceptId of [...new Set(conceptIds)]) {
    const items = await db.select({ itemId: itemConcepts.itemId }).from(itemConcepts).where(eq(itemConcepts.conceptId, conceptId));
    const itemIds = items.map((i) => i.itemId);
    if (itemIds.length === 0) continue;
    const [learnerRow] = await db
      .select({ n: sql<number>`count(distinct ${itemStates.userId})::int` })
      .from(itemStates)
      .where(inArray(itemStates.itemId, itemIds));
    const [struggleRow] = await db
      .select({ n: sql<number>`count(distinct ${conceptStruggles.userId})::int` })
      .from(conceptStruggles)
      .where(and(eq(conceptStruggles.conceptId, conceptId), inArray(conceptStruggles.status, ["detected", "in_progress"])));
    const learners = Number(learnerRow?.n ?? 0);
    const struggling = Number(struggleRow?.n ?? 0);
    if (!isHotspot(learners, struggling, config)) continue;

    // Frage mit den meisten Fehlern (Antworten in Sessions, ohne Verstehens-Aufgaben) und häufigste falsche Option
    const wrong = await db
      .select({
        questionId: studySessionItems.referenceId,
        optionId: studySessionItems.selectedOptionId,
        n: sql<number>`count(*)::int`,
      })
      .from(studySessionItems)
      .where(and(inArray(studySessionItems.referenceId, itemIds), eq(studySessionItems.outcome, "incorrect"), notInArray(studySessionItems.category, ["understand", "prereq"])))
      .groupBy(studySessionItems.referenceId, studySessionItems.selectedOptionId)
      .orderBy(desc(sql`count(*)`));
    const perQuestion = new Map<string, number>();
    for (const w of wrong) perQuestion.set(w.questionId, (perQuestion.get(w.questionId) ?? 0) + Number(w.n));
    const targetId = [...perQuestion.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? itemIds[0];
    const topOptionRow = wrong.find((w) => w.optionId && w.questionId === targetId);
    let topWrongOption: ContentReportDetail["topWrongOption"] = null;
    if (topOptionRow?.optionId) {
      const [option] = await db.select({ text: questionOptions.text }).from(questionOptions).where(eq(questionOptions.id, topOptionRow.optionId)).limit(1);
      if (option) topWrongOption = { text: option.text, count: Number(topOptionRow.n) };
    }
    const [concept] = await db.select({ name: concepts.name }).from(concepts).where(eq(concepts.id, conceptId)).limit(1);
    const detail: ContentReportDetail = { conceptId, conceptName: concept?.name ?? "", learners, struggling, topWrongOption };

    const [open] = await db
      .select({ id: contentReports.id })
      .from(contentReports)
      .where(and(eq(contentReports.targetType, "question"), eq(contentReports.targetId, targetId), eq(contentReports.reason, "concept_struggle"), eq(contentReports.status, "open")))
      .limit(1);
    if (open) {
      await db.update(contentReports).set({ detail }).where(eq(contentReports.id, open.id));
      continue;
    }
    await db.insert(contentReports).values({ reporterUserId: null, targetType: "question", targetId, reason: "concept_struggle", detail });
    created++;
  }
  return created;
}
