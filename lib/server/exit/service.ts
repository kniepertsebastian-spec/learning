/** Notausstieg „Heute reicht's“: Kandidaten für Erfolgsaufgaben laden. */
import { and, eq, inArray, lte, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, itemStates, learningExits, objectives, questions, sections, studySessionItems, studySessions, type LearningExitSource } from "@/lib/server/db/schema";
import type { EnergyLevel } from "@/lib/types";
import { detectStruggles } from "@/lib/server/understanding/service";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { retrievability } from "@/lib/server/psrp/fsrs";
import { DEFAULT_EXIT_CONFIG, pickWinItems, type ExitConfig } from "./rules";

const DAY_MS = 86_400_000;

/** Bis zu drei Fragen, die der Nutzer sehr wahrscheinlich kann und die ohnehin in den nächsten Tagen fällig wären. */
export async function planWinItems(
  userId: string,
  certificationId: string,
  excludeQuestionIds: string[],
  now: Date = new Date(),
  config: ExitConfig = DEFAULT_EXIT_CONFIG,
): Promise<string[]> {
  const rows = await getDb()
    .select({ state: itemStates })
    .from(itemStates)
    .innerJoin(questions, eq(questions.id, itemStates.itemId))
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(
      and(
        eq(itemStates.userId, userId),
        eq(domains.certificationId, certificationId),
        eq(questions.stale, false),
        eq(questions.probeOnly, false),
        lte(itemStates.due, new Date(now.getTime() + config.dueWithinDays * DAY_MS)),
        excludeQuestionIds.length > 0 ? notInArray(itemStates.itemId, excludeQuestionIds) : undefined,
      ),
    );
  return pickWinItems(
    rows.flatMap(({ state }) => {
      const r = retrievability(state, now);
      return r === null ? [] : [{ itemId: state.itemId, retrievability: r, due: state.due }];
    }),
    now,
    config,
  );
}


/** Ein Notausstieg wird festgehalten (Signal für Frühwarnung und Verstehens-Modus); bei Teilnahme des Verstehens-Modus wird das Konzept neu bewertet. */
export async function recordExit(params: { userId: string; source: LearningExitSource; sessionId?: string; sectionId?: string; questionId?: string | null }): Promise<void> {
  await getDb().insert(learningExits).values({
    userId: params.userId,
    source: params.source,
    sessionId: params.sessionId ?? null,
    sectionId: params.sectionId ?? null,
    questionId: params.questionId ?? null,
  });
  if (params.questionId && isFeatureEnabled("understanding_mode", params.userId)) {
    await detectStruggles(params.userId, [params.questionId]).catch((error) => console.error("Verstehens-Erkennung (Ausstieg) fehlgeschlagen:", error));
  }
}

/** Mini-Session mit Erfolgsaufgaben; null, wenn es keine gibt oder für den Kurs bereits eine aktive Session läuft. */
export async function createWinSession(userId: string, certificationId: string, questionIds: string[], energyLevel: EnergyLevel | null): Promise<string | null> {
  if (questionIds.length === 0) return null;
  const db = getDb();
  const [active] = await db
    .select({ id: studySessions.id })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.certificationId, certificationId), inArray(studySessions.status, ["planned", "in_progress"])))
    .limit(1);
  if (active) return null;
  const [win] = await db
    .insert(studySessions)
    .values({ userId, certificationId, status: "planned", goalType: "questions", goalValue: questionIds.length, energyLevel })
    .returning();
  await db.insert(studySessionItems).values(
    questionIds.map((id, index) => ({ sessionId: win.id, orderNum: index + 1, category: "win" as const, referenceType: "question" as const, referenceId: id })),
  );
  return win.id;
}

/**
 * Notausstieg im Lektionstest: bisherige Antworten werden normal gewertet (über `record`), unbeantwortete Fragen nicht. Danach höchstens
 * drei Erfolgsaufgaben, sofern für den Kurs keine Session läuft.
 */
export async function exitSectionQuiz(
  userId: string,
  sectionId: string,
  openQuestionId: string | null,
  record: () => Promise<unknown>,
): Promise<{ winSession: boolean } | null> {
  const db = getDb();
  const [section] = await db
    .select({ objectiveId: sections.objectiveId, certificationId: domains.certificationId })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(sections.id, sectionId))
    .limit(1);
  if (!section) return null;
  await record();
  await recordExit({ userId, source: "section_quiz", sectionId, questionId: openQuestionId });
  const sameObjective = await db.select({ id: questions.id }).from(questions).where(eq(questions.objectiveId, section.objectiveId));
  const winIds = await planWinItems(userId, section.certificationId, sameObjective.map((q) => q.id)).catch(() => [] as string[]);
  return { winSession: (await createWinSession(userId, section.certificationId, winIds, null)) !== null };
}
