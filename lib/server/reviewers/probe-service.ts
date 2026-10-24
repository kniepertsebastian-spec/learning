/**
 * Probe-Review für neue Prüfer (roadmap_pruefer Phase 5). Admins pflegen Sätze mit eingebauten Fehlern; Kandidaten prüfen sie im Prüfer-Werkzeug und
 * melden fehlerhafte Fragen; die Auswertung ist regelbasiert und nur intern. Bestanden (oder vom Admin freigeschaltet) = Freigaberechte und
 * Veröffentlichung des Profils. Wiederholung frühestens nach 30 Tagen mit einem anderen Satz.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { probeAttempts, probeSetItems, probeSets, reviewerProfiles, reviewerQualifications, users, type ProbeErrorType, type ProbeReport } from "@/lib/server/db/schema";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { evaluateProbe, MAX_REPORT_TEXT, nextAttemptAllowedAt, PROBE_ERROR_TYPES, validateProbeSet, type ProbeItemDraft } from "@/lib/reviewers/probe";
import type { Locale } from "@/lib/types";

export class ProbeError extends Error {
  constructor(message: string, readonly problems: string[] = []) {
    super(message);
  }
}
export class NotQualifiedError extends ProbeError {
  constructor() {
    super("Freigeben und veröffentlichen kannst du erst nach bestandenem Probe-Review oder wenn der Betreiber dich freischaltet.");
  }
}

const logAuditFailure = (err: unknown) => console.error("Audit-Log fehlgeschlagen:", err);

/* ------------------------------------------------------------------ Freigaberechte */

export async function getQualification(userId: string) {
  const [row] = await getDb().select().from(reviewerQualifications).where(eq(reviewerQualifications.userId, userId)).limit(1);
  return row ?? null;
}
export const isQualified = async (userId: string) => Boolean(await getQualification(userId));

export async function assertQualified(userId: string): Promise<void> {
  if (!(await isQualified(userId))) throw new NotQualifiedError();
}

/** Admin schaltet eine Person mit Prüfer-Rolle frei (z. B. den persönlich ausgewählten ersten Experten) oder nimmt die Freischaltung zurück. */
export async function setQualification(adminUserId: string, userId: string, granted: boolean, now = new Date()): Promise<boolean> {
  const db = getDb();
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target || target.role !== "reviewer") return false;
  if (granted) {
    await db.insert(reviewerQualifications).values({ userId, source: "admin", grantedByUserId: adminUserId, grantedAt: now }).onConflictDoNothing();
  } else {
    await db.delete(reviewerQualifications).where(eq(reviewerQualifications.userId, userId));
  }
  await recordAuditEvent({ actorUserId: adminUserId, action: granted ? "reviewer.qualification_granted" : "reviewer.qualification_revoked", targetType: "user", targetId: userId }).catch(logAuditFailure);
  return true;
}

/* ------------------------------------------------------------------ Admin: Sätze */

export type ProbeSetSummary = { id: string; title: string; topic: string; language: Locale; active: boolean; itemCount: number; plantedCount: number; attempts: number };

export async function listProbeSets(): Promise<ProbeSetSummary[]> {
  const db = getDb();
  const sets = await db.select().from(probeSets).orderBy(desc(probeSets.createdAt));
  if (sets.length === 0) return [];
  const [items, attempts] = await Promise.all([
    db.select({ setId: probeSetItems.setId, planted: sql<number>`count(*) filter (where ${probeSetItems.plantedError} is not null)::int`, total: sql<number>`count(*)::int` }).from(probeSetItems).groupBy(probeSetItems.setId),
    db.select({ setId: probeAttempts.setId, n: sql<number>`count(*)::int` }).from(probeAttempts).groupBy(probeAttempts.setId),
  ]);
  return sets.map((s) => ({
    id: s.id,
    title: s.title,
    topic: s.topic,
    language: s.language,
    active: s.active,
    itemCount: items.find((i) => i.setId === s.id)?.total ?? 0,
    plantedCount: items.find((i) => i.setId === s.id)?.planted ?? 0,
    attempts: attempts.find((a) => a.setId === s.id)?.n ?? 0,
  }));
}

export type ProbeSetForAdmin = { id: string; title: string; topic: string; language: Locale; active: boolean; attempts: number; items: ProbeItemDraft[] };

export async function getProbeSetForAdmin(id: string): Promise<ProbeSetForAdmin | null> {
  const db = getDb();
  const [set] = await db.select().from(probeSets).where(eq(probeSets.id, id)).limit(1);
  if (!set) return null;
  const [items, [att]] = await Promise.all([
    db.select().from(probeSetItems).where(eq(probeSetItems.setId, id)).orderBy(asc(probeSetItems.orderNum)),
    db.select({ n: sql<number>`count(*)::int` }).from(probeAttempts).where(eq(probeAttempts.setId, id)),
  ]);
  return { id: set.id, title: set.title, topic: set.topic, language: set.language, active: set.active, attempts: att?.n ?? 0, items: items.map((i) => ({ question: i.question, options: i.options, explanation: i.explanation, plantedError: i.plantedError ?? null })) };
}

export async function createProbeSet(adminUserId: string, input: { title: string; topic: string; language: Locale }): Promise<string> {
  const title = input.title.trim().slice(0, 150);
  const topic = input.topic.trim().slice(0, 150);
  if (!title || !topic) throw new ProbeError("Titel und Themengebiet sind Pflicht.");
  const [row] = await getDb().insert(probeSets).values({ title, topic, language: input.language === "en" ? "en" : "de", createdByUserId: adminUserId }).returning({ id: probeSets.id });
  return row.id;
}

const cleanItems = (items: ProbeItemDraft[]): ProbeItemDraft[] =>
  items.map((i) => ({
    question: i.question.trim(),
    explanation: i.explanation.trim(),
    options: i.options.map((o) => ({ text: o.text.trim(), isCorrect: Boolean(o.isCorrect) })),
    plantedError: i.plantedError ? { type: i.plantedError.type, note: i.plantedError.note.trim() } : null,
  }));

/**
 * Satz speichern (Fragen werden ersetzt). Aktiv geht nur mit gültigem Satz. Sobald es Versuche gibt, bleiben die Fragen gesperrt, damit gespeicherte
 * Meldungen und Ergebnisse nachvollziehbar bleiben (dafür einen neuen Satz anlegen).
 */
export async function saveProbeSet(id: string, input: { title: string; topic: string; language: Locale; active: boolean; items: ProbeItemDraft[] }): Promise<void> {
  const db = getDb();
  const current = await getProbeSetForAdmin(id);
  if (!current) throw new ProbeError("Satz nicht gefunden.");
  const items = cleanItems(input.items);
  // Gleiche Schlüsselreihenfolge auf beiden Seiten (jsonb sortiert Schlüssel um), sonst wären gleiche Fragen „geändert“.
  const itemsChanged = JSON.stringify(items) !== JSON.stringify(cleanItems(current.items));
  if (itemsChanged && current.attempts > 0) throw new ProbeError("Zu diesem Satz gibt es schon Versuche; die Fragen lassen sich nicht mehr ändern. Lege einen neuen Satz an.");
  const problems = validateProbeSet(items);
  if (input.active && problems.length > 0) throw new ProbeError("Der Satz lässt sich so nicht aktivieren.", problems);
  if (items.some((i) => i.plantedError && !PROBE_ERROR_TYPES.includes(i.plantedError.type))) throw new ProbeError("Unbekannter Fehlertyp.");
  const title = input.title.trim().slice(0, 150);
  const topic = input.topic.trim().slice(0, 150);
  if (!title || !topic) throw new ProbeError("Titel und Themengebiet sind Pflicht.");
  await db.transaction(async (tx) => {
    await tx.update(probeSets).set({ title, topic, language: input.language === "en" ? "en" : "de", active: input.active, updatedAt: new Date() }).where(eq(probeSets.id, id));
    if (itemsChanged) {
      await tx.delete(probeSetItems).where(eq(probeSetItems.setId, id));
      if (items.length) await tx.insert(probeSetItems).values(items.map((i, n) => ({ setId: id, orderNum: n + 1, question: i.question, options: i.options, explanation: i.explanation, plantedError: i.plantedError })));
    }
  });
}

export async function deleteProbeSet(id: string): Promise<boolean> {
  const db = getDb();
  const [att] = await db.select({ n: sql<number>`count(*)::int` }).from(probeAttempts).where(eq(probeAttempts.setId, id));
  if ((att?.n ?? 0) > 0) throw new ProbeError("Zu diesem Satz gibt es Versuche; er lässt sich nicht löschen. Deaktiviere ihn stattdessen.");
  return (await db.delete(probeSets).where(eq(probeSets.id, id)).returning({ id: probeSets.id })).length > 0;
}

/* ------------------------------------------------------------------ Admin: Ergebnisse */

export type ProbeAttemptForAdmin = {
  id: string;
  userId: string;
  reviewerName: string;
  setTitle: string;
  submittedAt: Date;
  result: { found: number; plantedTotal: number; falseAlarms: number; passed: boolean };
  /** Meldungen zu Fragen ohne eingebauten Fehler: Fehlalarme, aber mit Begründung für den Admin (vielleicht stimmt der Hinweis ja). */
  extraNotes: Array<{ question: string; type: ProbeErrorType; text: string }>;
};

export async function listProbeAttemptsForAdmin(): Promise<ProbeAttemptForAdmin[]> {
  const db = getDb();
  const rows = await db
    .select({ attempt: probeAttempts, email: users.email, first: reviewerProfiles.firstName, last: reviewerProfiles.lastName, setTitle: probeSets.title })
    .from(probeAttempts)
    .innerJoin(users, eq(users.id, probeAttempts.userId))
    .innerJoin(probeSets, eq(probeSets.id, probeAttempts.setId))
    .leftJoin(reviewerProfiles, eq(reviewerProfiles.userId, probeAttempts.userId))
    .where(isNotNull(probeAttempts.submittedAt))
    .orderBy(desc(probeAttempts.submittedAt));
  if (rows.length === 0) return [];
  const items = await db.select().from(probeSetItems).where(inArray(probeSetItems.setId, [...new Set(rows.map((r) => r.attempt.setId))]));
  return rows.flatMap((r) =>
    r.attempt.result && r.attempt.submittedAt
      ? [
          {
            id: r.attempt.id,
            userId: r.attempt.userId,
            reviewerName: r.first ? `${r.first} ${r.last}`.trim() : r.email,
            setTitle: r.setTitle,
            submittedAt: r.attempt.submittedAt,
            result: r.attempt.result,
            extraNotes: r.attempt.reports.flatMap((rep) => {
              const item = items.find((i) => i.id === rep.itemId);
              return item && !item.plantedError ? [{ question: item.question.slice(0, 160), type: rep.type, text: rep.text }] : [];
            }),
          },
        ]
      : [],
  );
}

export type ReviewerQualificationRow = { userId: string; email: string; name: string | null; qualified: boolean; source: "probe" | "admin" | null; grantedAt: Date | null };

export async function listReviewerQualifications(): Promise<ReviewerQualificationRow[]> {
  const rows = await getDb()
    .select({ userId: users.id, email: users.email, first: reviewerProfiles.firstName, last: reviewerProfiles.lastName, source: reviewerQualifications.source, grantedAt: reviewerQualifications.grantedAt })
    .from(users)
    .leftJoin(reviewerQualifications, eq(reviewerQualifications.userId, users.id))
    .leftJoin(reviewerProfiles, eq(reviewerProfiles.userId, users.id))
    .where(eq(users.role, "reviewer"))
    .orderBy(asc(users.email));
  return rows.map((r) => ({ userId: r.userId, email: r.email, name: r.first ? `${r.first} ${r.last}`.trim() : null, qualified: r.source !== null, source: r.source, grantedAt: r.grantedAt }));
}

/* ------------------------------------------------------------------ Kandidat */

export type ProbeOverview = {
  qualified: boolean;
  source: "probe" | "admin" | null;
  openAttemptId: string | null;
  /** Sätze, die diese Person jetzt beginnen darf (aktiv, noch nicht versucht, Wartezeit vorbei). */
  available: Array<{ id: string; title: string; topic: string; language: Locale; itemCount: number }>;
  /** Frühester nächster Versuch nach einem nicht bestandenen. */
  blockedUntil: Date | null;
  lastOutcome: "passed" | "failed" | null;
};

export async function getProbeOverview(userId: string, now = new Date()): Promise<ProbeOverview> {
  const db = getDb();
  const [qualification, attempts, sets] = await Promise.all([
    getQualification(userId),
    db.select().from(probeAttempts).where(eq(probeAttempts.userId, userId)).orderBy(desc(probeAttempts.startedAt)),
    listProbeSets(),
  ]);
  const open = attempts.find((a) => !a.submittedAt) ?? null;
  const lastSubmitted = attempts.find((a) => a.submittedAt) ?? null;
  const blockedUntil = lastSubmitted && !lastSubmitted.passed && lastSubmitted.submittedAt ? nextAttemptAllowedAt(lastSubmitted.submittedAt) : null;
  const waiting = blockedUntil !== null && blockedUntil > now;
  const tried = new Set(attempts.map((a) => a.setId));
  const available = qualification || open || waiting ? [] : sets.filter((s) => s.active && !tried.has(s.id)).map((s) => ({ id: s.id, title: s.title, topic: s.topic, language: s.language, itemCount: s.itemCount }));
  return { qualified: Boolean(qualification), source: qualification?.source ?? null, openAttemptId: open?.id ?? null, available, blockedUntil: waiting ? blockedUntil : null, lastOutcome: lastSubmitted ? (lastSubmitted.passed ? "passed" : "failed") : null };
}

export async function startAttempt(userId: string, setId: string, now = new Date()): Promise<string> {
  const overview = await getProbeOverview(userId, now);
  if (overview.openAttemptId) return overview.openAttemptId;
  if (overview.qualified) throw new ProbeError("Du bist schon freigeschaltet.");
  if (overview.blockedUntil) throw new ProbeError(`Der nächste Versuch ist ab ${overview.blockedUntil.toLocaleDateString("de-DE", { timeZone: "UTC" })} möglich.`);
  if (!overview.available.some((s) => s.id === setId)) throw new ProbeError("Dieser Satz steht dir nicht zur Verfügung.");
  const [row] = await getDb().insert(probeAttempts).values({ userId, setId, startedAt: now }).returning({ id: probeAttempts.id });
  return row.id;
}

export type ProbeAttemptView = {
  id: string;
  title: string;
  topic: string;
  language: Locale;
  submitted: boolean;
  items: Array<{ id: string; question: string; options: Array<{ text: string; isCorrect: boolean }>; explanation: string }>;
  reports: ProbeReport[];
};

/** Der Versuch einer Person ohne jede Angabe zu eingebauten Fehlern. */
export async function getAttemptView(userId: string, attemptId: string): Promise<ProbeAttemptView | null> {
  const db = getDb();
  const [attempt] = await db.select().from(probeAttempts).where(and(eq(probeAttempts.id, attemptId), eq(probeAttempts.userId, userId))).limit(1);
  if (!attempt) return null;
  const [[set], items] = await Promise.all([
    db.select().from(probeSets).where(eq(probeSets.id, attempt.setId)).limit(1),
    db.select().from(probeSetItems).where(eq(probeSetItems.setId, attempt.setId)).orderBy(asc(probeSetItems.orderNum)),
  ]);
  return {
    id: attempt.id,
    title: set.title,
    topic: set.topic,
    language: set.language,
    submitted: Boolean(attempt.submittedAt),
    items: items.map((i) => ({ id: i.id, question: i.question, options: i.options, explanation: i.explanation })),
    reports: attempt.reports,
  };
}

/** Meldung „fehlerhaft“ zu einer Frage setzen oder (mit `report = null`) zurücknehmen. Nur im offenen Versuch. */
export async function setReport(userId: string, attemptId: string, itemId: string, report: { type: ProbeErrorType; text: string } | null): Promise<void> {
  const db = getDb();
  const [attempt] = await db.select().from(probeAttempts).where(and(eq(probeAttempts.id, attemptId), eq(probeAttempts.userId, userId))).limit(1);
  if (!attempt) throw new ProbeError("Versuch nicht gefunden.");
  if (attempt.submittedAt) throw new ProbeError("Der Versuch ist schon abgegeben.");
  const [item] = await db.select({ id: probeSetItems.id }).from(probeSetItems).where(and(eq(probeSetItems.id, itemId), eq(probeSetItems.setId, attempt.setId))).limit(1);
  if (!item) throw new ProbeError("Frage nicht gefunden.");
  let reports = attempt.reports.filter((r) => r.itemId !== itemId);
  if (report) {
    if (!PROBE_ERROR_TYPES.includes(report.type)) throw new ProbeError("Bitte wähle die Art des Fehlers.");
    const text = report.text.trim().slice(0, MAX_REPORT_TEXT);
    if (text.length < 3) throw new ProbeError("Bitte begründe die Meldung kurz.");
    reports = [...reports, { itemId, type: report.type, text }];
  }
  await db.update(probeAttempts).set({ reports }).where(eq(probeAttempts.id, attemptId));
}

/** Abgeben und regelbasiert auswerten. Bestanden schaltet die Freigaberechte frei. Dem Kandidaten wird nur bestanden/nicht bestanden gezeigt. */
export async function submitAttempt(userId: string, attemptId: string, now = new Date()): Promise<{ passed: boolean; nextAttemptAt: Date | null }> {
  const db = getDb();
  const [attempt] = await db.select().from(probeAttempts).where(and(eq(probeAttempts.id, attemptId), eq(probeAttempts.userId, userId), isNull(probeAttempts.submittedAt))).limit(1);
  if (!attempt) throw new ProbeError("Versuch nicht gefunden oder schon abgegeben.");
  const items = await db.select().from(probeSetItems).where(eq(probeSetItems.setId, attempt.setId));
  const result = evaluateProbe(items.map((i) => ({ id: i.id, planted: i.plantedError !== null })), attempt.reports.map((r) => r.itemId));
  await db.transaction(async (tx) => {
    await tx.update(probeAttempts).set({ submittedAt: now, result, passed: result.passed }).where(eq(probeAttempts.id, attemptId));
    if (result.passed) await tx.insert(reviewerQualifications).values({ userId, source: "probe", attemptId, grantedAt: now }).onConflictDoNothing();
  });
  await recordAuditEvent({ actorUserId: userId, action: result.passed ? "reviewer.probe_passed" : "reviewer.probe_failed", targetType: "probe_attempt", targetId: attemptId }).catch(logAuditFailure);
  return { passed: result.passed, nextAttemptAt: result.passed ? null : nextAttemptAllowedAt(now) };
}
