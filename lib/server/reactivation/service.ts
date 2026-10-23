import { and, eq, gt, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { learningActivities, organizationMemberships, reactivationMessages, simulationResults, studySessions, users, certifications } from "@/lib/server/db/schema";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { appUrl } from "@/lib/server/mail/config";
import type { MailMessage } from "@/lib/server/mail/mailer";
import { reactivationMessage } from "@/lib/server/mail/templates";
import { dueStage, isQuietHour, REACTIVATION_MAX_DAYS, REACTIVATION_STAGES, type Stage } from "@/lib/study/reactivation";
import { unsubscribeToken } from "./token";

const DAY_MS = 86_400_000;

export interface ReactivationResult {
  sent: number;
  skipped: number;
}

/**
 * Verschickt die Reaktivierungs-Mails (täglich per Cron, `npm run reactivation:run`). Nur an Personen mit Flag
 * `reactivation`, ohne Abmeldung (Reaktivierung oder Prüfungserinnerungen), außerhalb des Firmenbereichs (dort gelten
 * allein die Fristerinnerungen) und nur tagsüber in der Zeitzone der Person. Höchstens eine Mail je Lauf und Person.
 */
export async function runReactivation(now: Date, send: (message: MailMessage) => Promise<boolean>): Promise<ReactivationResult> {
  const db = getDb();
  const earliest = new Date(now.getTime() - REACTIVATION_MAX_DAYS * DAY_MS);
  const latest = new Date(now.getTime() - REACTIVATION_STAGES[0].days * DAY_MS);

  // Kandidaten: letzte abgeschlossene Session liegt im Fenster; die übrigen Aktivitäten prüft die Schleife.
  const candidates = await db
    .select({
      userId: studySessions.userId,
      lastSession: sql<Date>`max(${studySessions.completedAt})`.mapWith((v) => new Date(v)),
    })
    .from(studySessions)
    .where(eq(studySessions.status, "completed"))
    .groupBy(studySessions.userId)
    .having(sql`max(${studySessions.completedAt}) <= ${latest.toISOString()}::timestamptz and max(${studySessions.completedAt}) > ${earliest.toISOString()}::timestamptz`);

  let sent = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const userId = candidate.userId;
    if (!isFeatureEnabled("reactivation", userId)) continue;
    const [user] = await db
      .select({ email: users.email, timezone: users.timezone, optOut: users.reactivationOptOut, examOptOut: users.examRemindersOptOut, verified: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || user.optOut || user.examOptOut || !user.verified) {
      skipped++;
      continue;
    }
    // Firmenbereich: keine Reaktivierung, es gelten nur die vorhandenen Fristerinnerungen.
    const [member] = await db.select({ id: organizationMemberships.id }).from(organizationMemberships).where(eq(organizationMemberships.userId, userId)).limit(1);
    if (member) {
      skipped++;
      continue;
    }
    if (isQuietHour(now, user.timezone ?? "UTC")) continue; // Ruhezeit: der nächste Lauf holt es nach

    // Letzte Aktivität: Session, gelöste Simulation oder Spickzettel (wie beim Wochenziel).
    const [sim] = await db.select({ at: sql<Date | null>`max(${simulationResults.lastSolvedAt})` }).from(simulationResults).where(eq(simulationResults.userId, userId));
    const [act] = await db.select({ at: sql<Date | null>`max(${learningActivities.createdAt})` }).from(learningActivities).where(eq(learningActivities.userId, userId));
    const lastActivityAt = new Date(Math.max(candidate.lastSession.getTime(), sim?.at ? new Date(sim.at).getTime() : 0, act?.at ? new Date(act.at).getTime() : 0));

    const sentRows = await db
      .select({ stage: reactivationMessages.stage })
      .from(reactivationMessages)
      .where(and(eq(reactivationMessages.userId, userId), gt(reactivationMessages.sentAt, lastActivityAt)));
    const stage = dueStage({ lastActivityAt, now, sentSinceActivity: sentRows.map((r) => r.stage) });
    if (!stage) continue;

    // Lernpfad der letzten Session; ein ausgeblendeter oder inzwischen entfernter Pfad bekommt keine Mail.
    const [last] = await db
      .select({ certId: studySessions.certificationId, slug: certifications.slug })
      .from(studySessions)
      .innerJoin(certifications, eq(certifications.id, studySessions.certificationId))
      .where(and(eq(studySessions.userId, userId), eq(studySessions.status, "completed")))
      .orderBy(sql`${studySessions.completedAt} desc`)
      .limit(1);
    if (!last || (await isCertificationHidden(userId, last.certId))) continue;

    const ok = await send(
      reactivationMessage(user.email, {
        stage,
        link: appUrl(`/cert/${last.slug}/restart`),
        unsubscribeLink: appUrl(`/unsubscribe/reactivation?u=${userId}&t=${unsubscribeToken(userId)}`),
      }),
    );
    if (!ok) continue;
    await db.insert(reactivationMessages).values({ userId, stage: stage as Stage, anchorAt: lastActivityAt, sentAt: now });
    sent++;
  }
  return { sent, skipped };
}

/** Rückkehrquote für `psrp:metrics`: Anteil der Personen mit einer abgeschlossenen Session binnen 7 Tagen nach einer Mail. */
export async function reactivationStats(asOf: Date): Promise<{ messages: number; returnedWithin7Days: number }> {
  const db = getDb();
  const rows = await db.select({ userId: reactivationMessages.userId, sentAt: reactivationMessages.sentAt }).from(reactivationMessages);
  const considered = rows.filter((r) => r.sentAt <= asOf);
  let returned = 0;
  for (const r of considered) {
    const until = new Date(r.sentAt.getTime() + 7 * DAY_MS);
    const [back] = await db
      .select({ id: studySessions.id })
      .from(studySessions)
      .where(and(eq(studySessions.userId, r.userId), eq(studySessions.status, "completed"), gt(studySessions.completedAt, r.sentAt), lte(studySessions.completedAt, until)))
      .limit(1);
    if (back) returned++;
  }
  return { messages: considered.length, returnedWithin7Days: returned };
}

