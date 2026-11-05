import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { planReminders } from "@/lib/exams/plan";
import {
  activeWeekdays,
  examPayload,
  inReminderWindow,
  localParts,
  MIN_DUE_FOR_PUSH,
  pickReminderHour,
  reviewsDuePayload,
  streakAtRisk,
  streakRiskPayload,
  type PushPayload,
} from "@/lib/push/logic";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  examPlans,
  itemStates,
  learningPreferences,
  pushDeliveries,
  pushPreferences,
  pushSubscriptions,
  reviewLog,
  studySessions,
  users,
  type PushKind,
} from "@/lib/server/db/schema";
import { webPushSender, type PushSender } from "./sender";

/**
 * Web Push (docs/roadmaps/roadmap_pwa.md, Phase 6): Abos je Gerät, Einstellungen je Person und der stündliche Lauf der Erinnerungen
 * (`npm run push:remind`). Ein Abo entsteht nur auf eigenen Wunsch der Person (siehe components/PushSettings.tsx); ohne Abo
 * läuft nichts. Die Regeln (Uhrzeit, Tage, Texte) stehen in lib/push/logic.ts.
 */

export interface PushPrefs {
  examReminders: boolean;
  reviewsDue: boolean;
  streakRisk: boolean;
}

const DEFAULT_PREFS: PushPrefs = { examReminders: true, reviewsDue: true, streakRisk: true };
const MAX_FAILURES = 5;
const DAY_MS = 86_400_000;
/** Prüfungs-Erinnerungen nur tagsüber (lokale Stunde). */
const EXAM_HOURS = { from: 9, to: 20 } as const;

export async function getPushPreferences(userId: string): Promise<PushPrefs> {
  const [row] = await getDb().select().from(pushPreferences).where(eq(pushPreferences.userId, userId)).limit(1);
  return row ? { examReminders: row.examReminders, reviewsDue: row.reviewsDue, streakRisk: row.streakRisk } : { ...DEFAULT_PREFS };
}

export async function savePushPreferences(userId: string, patch: Partial<PushPrefs>): Promise<PushPrefs> {
  const next = { ...(await getPushPreferences(userId)), ...patch };
  await getDb()
    .insert(pushPreferences)
    .values({ userId, ...next })
    .onConflictDoUpdate({ target: pushPreferences.userId, set: { ...next, updatedAt: new Date() } });
  return next;
}

export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  authKey: string;
  locale: "de" | "en";
  userAgent: string | null;
}

/** Legt das Abo eines Geräts an oder aktualisiert es. Gehörte die Adresse bisher einer anderen Person (Gerät, Konto gewechselt), gehört sie jetzt dieser. */
export async function saveSubscription(userId: string, input: SubscriptionInput): Promise<void> {
  await getDb()
    .insert(pushSubscriptions)
    .values({ userId, endpoint: input.endpoint, p256dh: input.p256dh, authKey: input.authKey, locale: input.locale, userAgent: input.userAgent?.slice(0, 300) ?? null })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: input.p256dh, authKey: input.authKey, locale: input.locale, userAgent: input.userAgent?.slice(0, 300) ?? null, failureCount: 0 },
    });
}

/** Beendet das Abo eines Geräts (Abmelden oder Ausschalten). Gibt zurück, ob es eines gab. */
export async function removeSubscription(userId: string, endpoint: string): Promise<boolean> {
  const rows = await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

export async function countSubscriptions(userId: string): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  return row?.n ?? 0;
}

/**
 * Schickt eine Nachricht an alle Geräte einer Person und führt Buch: Erfolg setzt die Fehlerzählung zurück, ein verschwundenes Abo
 * (404/410) wird gelöscht, andere Fehler zählen hoch und löschen das Abo nach MAX_FAILURES. Gibt die Zahl der erreichten Geräte zurück.
 * Die Nachricht kommt in der Sprache des jeweiligen Geräts (`payloadFor`).
 */
export async function sendToUser(userId: string, payloadFor: (locale: "de" | "en") => PushPayload, sender: PushSender = webPushSender): Promise<number> {
  const db = getDb();
  const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let delivered = 0;
  for (const sub of subscriptions) {
    const outcome = await sender({ endpoint: sub.endpoint, p256dh: sub.p256dh, authKey: sub.authKey }, payloadFor(sub.locale));
    if (outcome === "ok") {
      delivered++;
      await db.update(pushSubscriptions).set({ lastSuccessAt: new Date(), failureCount: 0 }).where(eq(pushSubscriptions.id, sub.id));
    } else if (outcome === "gone" || sub.failureCount + 1 >= MAX_FAILURES) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
    } else {
      await db.update(pushSubscriptions).set({ failureCount: sub.failureCount + 1 }).where(eq(pushSubscriptions.id, sub.id));
    }
  }
  return delivered;
}

/** Beansprucht „Art + Bezug“ für diese Person, bevor gesendet wird (verhindert Doppelte auch bei zwei gleichzeitigen Läufen). Null = schon vergeben. */
async function claim(userId: string, kind: PushKind, ref: string): Promise<string | null> {
  const [row] = await getDb().insert(pushDeliveries).values({ userId, kind, ref }).onConflictDoNothing().returning({ id: pushDeliveries.id });
  return row?.id ?? null;
}

async function release(id: string): Promise<void> {
  await getDb().delete(pushDeliveries).where(eq(pushDeliveries.id, id));
}

async function deliver(userId: string, kind: PushKind, ref: string, payloadFor: (locale: "de" | "en") => PushPayload, sender: PushSender): Promise<number> {
  const id = await claim(userId, kind, ref);
  if (!id) return 0;
  const delivered = await sendToUser(userId, payloadFor, sender);
  // Kein Gerät erreicht: den Anspruch zurückgeben, damit der nächste Lauf es noch einmal versucht.
  if (delivered === 0) await release(id);
  return delivered;
}

async function remindUser(userId: string, now: Date, sender: PushSender): Promise<number> {
  const db = getDb();
  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return 0;
  const prefs = await getPushPreferences(userId);
  const local = localParts(now, user.timezone);
  let sent = 0;

  // 1) Prüfungs-Erinnerungen: dieselben Anlässe wie bei der E-Mail (npm run exams:remind), einmal je Plan und Art, nur tagsüber.
  if (prefs.examReminders && local.hour >= EXAM_HOURS.from && local.hour <= EXAM_HOURS.to) {
    const plans = await db
      .select({ plan: examPlans, courseName: certifications.name })
      .from(examPlans)
      .innerJoin(certifications, eq(certifications.id, examPlans.certificationId))
      .where(and(eq(examPlans.userId, userId), inArray(examPlans.status, ["planned", "failed"])));
    for (const { plan, courseName } of plans) {
      for (const kind of planReminders(plan, now)) {
        const target = kind === "voucher_expiring" ? plan.voucherExpiresAt : plan.scheduledAt;
        const daysUntil = target ? Math.ceil((target.getTime() - now.getTime()) / DAY_MS) : 0;
        sent += await deliver(userId, kind, `plan:${plan.id}`, (locale) => examPayload(kind, { courseName, daysUntil }, locale), sender);
      }
    }
  }

  // 2) Tägliche Erinnerung: zur üblichen Lernzeit, an Lerntagen, nur eine je Tag und nur, wenn heute noch nicht gelernt wurde.
  if (!prefs.reviewsDue && !prefs.streakRisk) return sent;
  const since = new Date(now.getTime() - 60 * DAY_MS);
  const hourRows = await db
    .select({ hour: reviewLog.localHour, n: count() })
    .from(reviewLog)
    .where(and(eq(reviewLog.userId, userId), gte(reviewLog.timestampUtc, since)))
    .groupBy(reviewLog.localHour);
  const reminderHour = pickReminderHour(Object.fromEntries(hourRows.map((r) => [r.hour, r.n])));
  if (!inReminderWindow(local.hour, reminderHour)) return sent;

  const weekdayRows = await db
    .select({ weekday: reviewLog.weekday, days: sql<number>`count(distinct (${reviewLog.timestampUtc} at time zone ${user.timezone})::date)::int` })
    .from(reviewLog)
    .where(and(eq(reviewLog.userId, userId), gte(reviewLog.timestampUtc, new Date(now.getTime() - 56 * DAY_MS))))
    .groupBy(reviewLog.weekday)
    .catch(() => []); // eine ungültige Zeitzone in der Datenbank darf den Lauf nicht abbrechen
  if (!activeWeekdays(Object.fromEntries(weekdayRows.map((r) => [r.weekday, r.days]))).has(local.weekday)) return sent;

  const dayRef = `day:${local.dateKey}`;
  const [already] = await db
    .select({ id: pushDeliveries.id })
    .from(pushDeliveries)
    .where(and(eq(pushDeliveries.userId, userId), inArray(pushDeliveries.kind, ["reviews_due", "streak_risk"]), eq(pushDeliveries.ref, dayRef)))
    .limit(1);
  if (already) return sent;

  const sessions = await db
    .select({ completedAt: studySessions.completedAt })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.status, "completed"), gte(studySessions.completedAt, new Date(now.getTime() - 40 * DAY_MS))));
  const studyDays = new Set(sessions.flatMap((s) => (s.completedAt ? [localParts(s.completedAt, user.timezone).dateKey] : [])));
  if (studyDays.has(local.dateKey)) return sent; // heute schon gelernt: keine Mahnung

  // Die Serie nur anmahnen, wenn die Person sie auch sieht („Wie ich lerne“: Serie an).
  const [learning] = await db.select({ showStreak: learningPreferences.showStreak }).from(learningPreferences).where(eq(learningPreferences.userId, userId)).limit(1);
  const streak = prefs.streakRisk && learning?.showStreak ? streakAtRisk(studyDays, local.dateKey) : 0;
  if (streak > 0) return sent + (await deliver(userId, "streak_risk", dayRef, (locale) => streakRiskPayload(streak, locale), sender));

  if (prefs.reviewsDue) {
    const [due] = await db.select({ n: count() }).from(itemStates).where(and(eq(itemStates.userId, userId), lte(itemStates.due, now)));
    const dueCount = due?.n ?? 0;
    if (dueCount >= MIN_DUE_FOR_PUSH) sent += await deliver(userId, "reviews_due", dayRef, (locale) => reviewsDuePayload(dueCount, locale), sender);
  }
  return sent;
}

export interface PushRunResult {
  users: number;
  sent: number;
}

/** Stündlicher Lauf (`npm run push:remind`): jede Person mit mindestens einem Gerät bekommt, was jetzt ansteht. Fehler bei einer Person stoppen die anderen nicht. */
export async function runPushReminders(now: Date = new Date(), sender: PushSender = webPushSender): Promise<PushRunResult> {
  const rows = await getDb().select({ userId: pushSubscriptions.userId }).from(pushSubscriptions).groupBy(pushSubscriptions.userId);
  let sent = 0;
  for (const { userId } of rows) {
    try {
      sent += await remindUser(userId, now, sender);
    } catch (error) {
      console.error(`Push-Erinnerung für Nutzer ${userId} fehlgeschlagen:`, error instanceof Error ? error.message : error);
    }
  }
  return { users: rows.length, sent };
}
