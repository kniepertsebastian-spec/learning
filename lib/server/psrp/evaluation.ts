/**
 * PSRP-HR Phase 5: Evaluationsgruppen (Feature-Flags je Nutzer).
 *  - vanilla:         FSRS pur (Ziel-Retention fest, Fälligkeit wie berechnet, keine Planungsschicht)
 *  - planning:        Planungsschicht (Tageslimit, Priorisierung, Load Balancing, Prüfungsmodus), Φ = 0
 *  - planning_state:  zusätzlich Human State Engine (Φ aus Check-in, Chronotyp, Arbeitstag)
 */
import { createHash } from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { EVALUATION_GROUPS, users, type EvaluationGroup } from "@/lib/server/db/schema";

/** Stabile, gleichverteilte Zuteilung aus der Nutzer-ID (kein Zustand nötig, reproduzierbar). */
export function assignGroup(userId: string, salt = "psrp-hr-v1"): EvaluationGroup {
  const hash = createHash("sha256").update(`${salt}:${userId}`).digest();
  return EVALUATION_GROUPS[hash.readUInt32BE(0) % EVALUATION_GROUPS.length];
}

/** Gruppe des Nutzers; Bestandsnutzer ohne Zuteilung bekommen sie beim ersten Zugriff dauerhaft gespeichert. */
export async function getEvaluationGroup(userId: string): Promise<EvaluationGroup> {
  const db = getDb();
  const [row] = await db.select({ group: users.evaluationGroup }).from(users).where(eq(users.id, userId)).limit(1);
  if (row?.group) return row.group;
  const group = assignGroup(userId);
  await db.update(users).set({ evaluationGroup: group }).where(and(eq(users.id, userId), isNull(users.evaluationGroup)));
  return group;
}

export const usesPlanning = (group: EvaluationGroup) => group !== "vanilla";
export const usesHumanState = (group: EvaluationGroup) => group === "planning_state";
