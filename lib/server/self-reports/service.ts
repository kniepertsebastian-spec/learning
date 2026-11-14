/**
 * Freiwillige Selbstauskünfte (Aufgabe 17): speichern, lesen, je Art abschalten, Regel gegen Fragemüdigkeit.
 * - Schalter je Art (`self_report_settings.enabled`), ohne Zeile ist eine Art an.
 * - Dreimal in Folge übersprungen: die Art pausiert 30 Tage, danach beginnt die Zählung neu.
 * - Höchstens eine Frage je Lernsitzung, beantwortet oder übersprungen (eindeutiger Index auf `session_id`).
 * - Alles hinter dem Flag `self_reports`. Wann welche Frage kommt, regelt Aufgabe 18 über `canAskSelfReport`.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { selfReportSettings, selfReports, studySessions } from "@/lib/server/db/schema";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { SELF_REPORT_KINDS, SKIP_PAUSE_DAYS, SKIP_PAUSE_STREAK, parseSelfReportValue, type SelfReportKind, type SelfReportRefType } from "@/lib/self-reports";

const DAY_MS = 86_400_000;

export interface SelfReportSetting {
  kind: SelfReportKind;
  enabled: boolean;
  /** Pausiert nach dreimaligem Überspringen bis zu diesem Zeitpunkt; null = nicht pausiert. */
  pausedUntil: Date | null;
}

/** Einstellungen aller Arten, auch der ohne Zeile (dann an und nicht pausiert). Abgelaufene Pausen erscheinen als null. */
export async function getSelfReportSettings(userId: string, now: Date = new Date()): Promise<SelfReportSetting[]> {
  const rows = await getDb().select().from(selfReportSettings).where(eq(selfReportSettings.userId, userId));
  return SELF_REPORT_KINDS.map((kind) => {
    const row = rows.find((r) => r.kind === kind);
    return { kind, enabled: row?.enabled ?? true, pausedUntil: row?.pausedUntil && row.pausedUntil > now ? row.pausedUntil : null };
  });
}

export async function setSelfReportEnabled(userId: string, kind: SelfReportKind, enabled: boolean, now: Date = new Date()): Promise<void> {
  await getDb()
    .insert(selfReportSettings)
    .values({ userId, kind, enabled, updatedAt: now })
    .onConflictDoUpdate({ target: [selfReportSettings.userId, selfReportSettings.kind], set: { enabled, updatedAt: now } });
}

export type AskRefusal = "flag_off" | "disabled" | "paused" | "session_limit";

/**
 * Darf diese Art jetzt gefragt werden? Mit `sessionId` zusätzlich: in dieser Sitzung wurde noch nichts gefragt. Aufgabe 18 ruft
 * das auf, bevor sie eine Frage zeigt.
 */
export async function canAskSelfReport(userId: string, kind: SelfReportKind, options: { sessionId?: string | null; now?: Date } = {}): Promise<{ ok: true } | { ok: false; reason: AskRefusal }> {
  const now = options.now ?? new Date();
  if (!isFeatureEnabled("self_reports", userId)) return { ok: false, reason: "flag_off" };
  const setting = (await getSelfReportSettings(userId, now)).find((s) => s.kind === kind)!;
  if (!setting.enabled) return { ok: false, reason: "disabled" };
  if (setting.pausedUntil) return { ok: false, reason: "paused" };
  if (options.sessionId) {
    const [asked] = await getDb().select({ id: selfReports.id }).from(selfReports).where(eq(selfReports.sessionId, options.sessionId)).limit(1);
    if (asked) return { ok: false, reason: "session_limit" };
  }
  return { ok: true };
}

export interface SelfReportInput {
  kind: SelfReportKind;
  /** Antwort; null = übersprungen. */
  value: unknown;
  refType?: SelfReportRefType | null;
  refId?: string | null;
  sessionId?: string | null;
}

export type RecordResult = { ok: true; skipped: boolean; pausedUntil: Date | null } | { ok: false; reason: AskRefusal | "invalid_value" | "session_not_found" };

/** Antwort oder Überspringen speichern und den Zähler gegen Fragemüdigkeit fortschreiben. */
export async function recordSelfReport(userId: string, input: SelfReportInput, now: Date = new Date()): Promise<RecordResult> {
  const skipped = input.value === null || input.value === undefined;
  const value = skipped ? null : parseSelfReportValue(input.kind, input.value);
  if (!skipped && value === null) return { ok: false, reason: "invalid_value" };
  const db = getDb();
  if (input.sessionId) {
    const [own] = await db.select({ id: studySessions.id }).from(studySessions).where(and(eq(studySessions.id, input.sessionId), eq(studySessions.userId, userId))).limit(1);
    if (!own) return { ok: false, reason: "session_not_found" };
  }
  const allowed = await canAskSelfReport(userId, input.kind, { sessionId: input.sessionId, now });
  if (!allowed.ok) return allowed;

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(selfReports)
      .values({ userId, kind: input.kind, value, refType: input.refType ?? null, refId: input.refId ?? null, sessionId: input.sessionId ?? null, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: selfReports.id });
    // Gleichzeitig in derselben Sitzung schon gefragt (eindeutiger Index): nichts speichern.
    if (inserted.length === 0) return { ok: false as const, reason: "session_limit" as const };
    const [state] = await tx
      .insert(selfReportSettings)
      .values({ userId, kind: input.kind, skipStreak: skipped ? 1 : 0, updatedAt: now })
      .onConflictDoUpdate({
        target: [selfReportSettings.userId, selfReportSettings.kind],
        set: { skipStreak: skipped ? sql`${selfReportSettings.skipStreak} + 1` : 0, updatedAt: now },
      })
      .returning({ skipStreak: selfReportSettings.skipStreak });
    let pausedUntil: Date | null = null;
    if (state.skipStreak >= SKIP_PAUSE_STREAK) {
      pausedUntil = new Date(now.getTime() + SKIP_PAUSE_DAYS * DAY_MS);
      await tx.update(selfReportSettings).set({ skipStreak: 0, pausedUntil, updatedAt: now }).where(and(eq(selfReportSettings.userId, userId), eq(selfReportSettings.kind, input.kind)));
    }
    return { ok: true as const, skipped, pausedUntil };
  });
}

/** Die eigenen Selbstauskünfte, neueste zuerst. */
export async function listSelfReports(userId: string, limit = 100) {
  return getDb()
    .select({ kind: selfReports.kind, value: selfReports.value, refType: selfReports.refType, refId: selfReports.refId, sessionId: selfReports.sessionId, createdAt: selfReports.createdAt })
    .from(selfReports)
    .where(eq(selfReports.userId, userId))
    .orderBy(desc(selfReports.createdAt))
    .limit(limit);
}
