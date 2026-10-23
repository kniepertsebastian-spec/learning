/** Notausstieg „Heute reicht's“: Kandidaten für Erfolgsaufgaben laden. */
import { and, eq, lte, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, itemStates, objectives, questions } from "@/lib/server/db/schema";
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

