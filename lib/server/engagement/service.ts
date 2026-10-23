/** Frühwarnung (roadmap_motivation Phase 2): Fakten sammeln, Muster erkennen, Entlastung in der Planungsschicht, Rückkehr zum Normalzustand. */
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { engagementStates, itemStates, reviewLog, sessionCheckins, studySessions, type EngagementSignal } from "@/lib/server/db/schema";
import { retrievability } from "@/lib/server/psrp/fsrs";
import { DEFAULT_ENGAGEMENT_CONFIG, detectEngagementSignals, isPattern, type EngagementConfig, type EngagementFacts } from "./rules";

const DAY_MS = 86_400_000;
const BASELINE_LIMIT = 300;
const CHECKIN_LIMIT = 8;

export async function collectEngagementFacts(userId: string, now: Date, config: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG): Promise<EngagementFacts> {
  const db = getDb();
  const since = new Date(now.getTime() - config.windowDays * DAY_MS);
  const [sessions, window, baseline, checkins] = await Promise.all([
    db
      .select({ status: studySessions.status, plannedAt: studySessions.plannedAt, startedAt: studySessions.startedAt, completedAt: studySessions.completedAt, exitedAt: studySessions.exitedAt })
      .from(studySessions)
      .where(and(eq(studySessions.userId, userId), gte(studySessions.plannedAt, since))),
    db
      .select({ rating: reviewLog.rawRating, responseTimeMs: reviewLog.responseTimeMs })
      .from(reviewLog)
      .where(and(eq(reviewLog.userId, userId), gte(reviewLog.timestampUtc, since))),
    db
      .select({ rating: reviewLog.rawRating, responseTimeMs: reviewLog.responseTimeMs })
      .from(reviewLog)
      .where(and(eq(reviewLog.userId, userId), lt(reviewLog.timestampUtc, since)))
      .orderBy(desc(reviewLog.timestampUtc))
      .limit(BASELINE_LIMIT),
    db
      .select({ imputed: sessionCheckins.imputed })
      .from(sessionCheckins)
      .where(eq(sessionCheckins.userId, userId))
      .orderBy(desc(sessionCheckins.timestamp))
      .limit(CHECKIN_LIMIT),
  ]);
  return { sessions, window, baseline, checkinsSkipped: checkins.map((c) => c.imputed), exits: sessions.filter((s) => s.exitedAt !== null).length };
}

/**
 * Wertet das Muster aus und gibt zurück, ob dieser Nutzer jetzt entlastet wird. Reine Planung: Rohdaten und FSRS bleiben unverändert.
 * Nach „Nein danke“ (declinedUntil) und während einer laufenden Entlastung wird nicht neu ausgelöst.
 */
export async function refreshEngagement(userId: string, now: Date = new Date(), config: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG): Promise<{ deescalated: boolean }> {
  const db = getDb();
  const [state] = await db.select().from(engagementStates).where(eq(engagementStates.userId, userId)).limit(1);
  if (state?.status === "deescalated") {
    if (state.until && state.until > now && state.sessionsLeft > 0) return { deescalated: true };
    await db.update(engagementStates).set({ status: "normal", updatedAt: now }).where(eq(engagementStates.userId, userId));
    return { deescalated: false };
  }
  if (state?.declinedUntil && state.declinedUntil > now) return { deescalated: false };

  const signals = detectEngagementSignals(await collectEngagementFacts(userId, now, config), now, config);
  if (!isPattern(signals, config)) return { deescalated: false };
  const until = new Date(now.getTime() + 14 * DAY_MS);
  await db
    .insert(engagementStates)
    .values({ userId, status: "deescalated", signals, since: now, until, sessionsLeft: config.deescalationSessions, updatedAt: now })
    .onConflictDoUpdate({
      target: engagementStates.userId,
      set: { status: "deescalated", signals, since: now, until, sessionsLeft: config.deescalationSessions, updatedAt: now },
    });
  return { deescalated: true };
}

/** Nach einer abgeschlossenen entlasteten Session: Zähler senken, bei ruhigen Signalen oder nach der Dauer zurück zum Normalzustand. */
export async function afterDeescalatedSession(userId: string, now: Date = new Date(), config: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG): Promise<void> {
  const db = getDb();
  const [state] = await db.select().from(engagementStates).where(eq(engagementStates.userId, userId)).limit(1);
  if (!state || state.status !== "deescalated") return;
  const sessionsLeft = Math.max(0, state.sessionsLeft - 1);
  const calm = detectEngagementSignals(await collectEngagementFacts(userId, now, config), now, config).length === 0;
  const done = sessionsLeft === 0 || calm;
  await db
    .update(engagementStates)
    .set(done ? { status: "normal", sessionsLeft: 0, updatedAt: now } : { sessionsLeft, updatedAt: now })
    .where(eq(engagementStates.userId, userId));
}

/** „Nein danke, normal weiter“: Entlastung beenden, bis zum Ende der Wartezeit nicht erneut auslösen. */
export async function declineDeescalation(userId: string, now: Date = new Date(), config: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG): Promise<void> {
  const declinedUntil = new Date(now.getTime() + config.declineCooldownDays * DAY_MS);
  await getDb()
    .insert(engagementStates)
    .values({ userId, status: "normal", declinedUntil, updatedAt: now })
    .onConflictDoUpdate({ target: engagementStates.userId, set: { status: "normal", sessionsLeft: 0, declinedUntil, updatedAt: now } });
}

/** Entlastete Session: leichte Karten (hohe Abrufwahrscheinlichkeit) zuerst, schwierige nach hinten. Unbekannte Karten behalten ihren Platz am Ende. */
export async function orderEasiestFirst<T extends { questionId: string }>(userId: string, items: T[], now: Date): Promise<T[]> {
  if (items.length < 2) return items;
  const rows = await getDb()
    .select()
    .from(itemStates)
    .where(and(eq(itemStates.userId, userId), inArray(itemStates.itemId, items.map((i) => i.questionId))));
  const r = new Map(rows.map((row) => [row.itemId, retrievability(row, now) ?? 0]));
  return items
    .map((item, index) => ({ item, index, r: r.get(item.questionId) ?? 0 }))
    .sort((a, b) => b.r - a.r || a.index - b.index)
    .map((x) => x.item);
}

export type { EngagementSignal };
