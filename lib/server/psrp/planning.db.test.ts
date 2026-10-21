/** Phase 3/4 gegen echte DB: Check-in, Φ und Tagesplan; FSRS-Stabilität unabhängig von Φ und Gruppe. */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { itemStates, sessionCheckins, sessionDerived, users } from "@/lib/server/db/schema";
import { startStudySession } from "@/lib/server/study/session-service";
import { recordRatedReviews } from "./service";
import { seedCourse, seedUser } from "./test-db";

const run = TEST_DB ? describe : describe.skip;

run("Planungsschicht (echte DB)", () => {
  const userIds: string[] = [];
  let certId = "";
  let questionIds: string[] = [];

  beforeAll(async () => {
    ({ certId, questionIds } = await seedCourse(6));
  });
  afterAll(async () => {
    for (const id of userIds) await getDb().delete(users).where(eq(users.id, id));
  });

  async function userInGroup(group: "vanilla" | "planning" | "planning_state") {
    const id = await seedUser();
    userIds.push(id);
    await getDb().update(users).set({ evaluationGroup: group }).where(eq(users.id, id));
    return id;
  }

  it("speichert Check-in (roh) und Φ/r_target/Limit (abgeleitet) getrennt; Φ nur in planning_state", async () => {
    const state = await userInGroup("planning_state");
    const plan = await userInGroup("planning");
    const long = new Date(Date.now() - 20 * 86_400_000);
    for (const id of [state, plan]) {
      await recordRatedReviews(id, questionIds.slice(0, 3).map((itemId) => ({ itemId, rawRating: 3 as const })), { now: long });
    }
    const checkin = { energyLevel: 1, hadWorkday: true };
    const sState = await startStudySession(state, certId, 5, "minutes", undefined, checkin);
    const sPlan = await startStudySession(plan, certId, 5, "minutes", undefined, checkin);

    const [derivedState] = await getDb().select().from(sessionDerived).where(eq(sessionDerived.sessionId, sState.id));
    const [derivedPlan] = await getDb().select().from(sessionDerived).where(eq(sessionDerived.sessionId, sPlan.id));
    expect(derivedState.phi).toBeGreaterThan(0.5);
    expect(derivedState.rTarget).toBeLessThan(0.9);
    expect(derivedPlan.phi).toBe(0);
    expect(derivedPlan.rTarget).toBeCloseTo(0.9);
    expect(derivedState.dailyLimit).toBeLessThan(derivedPlan.dailyLimit);

    const [raw] = await getDb().select().from(sessionCheckins).where(eq(sessionCheckins.sessionId, sState.id));
    expect(raw).toMatchObject({ energyLevel: 1, hadWorkday: true, timeBudgetMin: 5, imputed: false });
  });

  it("übersprungener Check-in wird ergänzt und als imputed markiert", async () => {
    const id = await userInGroup("planning_state");
    const session = await startStudySession(id, certId, 10);
    const [raw] = await getDb().select().from(sessionCheckins).where(eq(sessionCheckins.sessionId, session.id));
    expect(raw.imputed).toBe(true);
    expect(raw.energyLevel).toBe(3);
  });

  it("gleiches Rohrating → gleiche Stabilität, egal welche Gruppe und welches Φ", async () => {
    const a = await userInGroup("vanilla");
    const b = await userInGroup("planning_state");
    const t1 = new Date("2026-01-01T10:00:00Z");
    const t2 = new Date("2026-01-06T10:00:00Z");
    await recordRatedReviews(a, [{ itemId: questionIds[5], rawRating: 3 }], { now: t1 });
    await recordRatedReviews(b, [{ itemId: questionIds[5], rawRating: 3 }], { now: t1 });
    await recordRatedReviews(a, [{ itemId: questionIds[5], rawRating: 3 }], { now: t2 });
    await recordRatedReviews(b, [{ itemId: questionIds[5], rawRating: 3 }], { now: t2, rTarget: 0.75 });
    const [sa] = await getDb().select().from(itemStates).where(eq(itemStates.userId, a));
    const [sb] = await getDb().select().from(itemStates).where(eq(itemStates.userId, b));
    expect(sb.stability).toBe(sa.stability);
    expect(sb.difficulty).toBe(sa.difficulty);
  });
});
