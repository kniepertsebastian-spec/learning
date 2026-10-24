/**
 * Datenintegrität über Zeit (roadmap_datenintegritaet.md, Phase 1): offline erbrachte Lernleistung wird mit dem Zeitpunkt
 * der Antwort verbucht, nicht mit dem der Synchronisation - begrenzt auf plausible Werte.
 */

const DAY_MS = 86_400_000;

/** Maximales Alter eines Ereignisses für zeitgenaue Verbuchung. Ältere werden nur protokolliert (kein Zustandswechsel). */
export const MAX_EVENT_AGE_MS = 30 * DAY_MS;
/** Toleranz für eine vorgehende Geräteuhr; spätere Zeitpunkte gelten als Serverzeit. */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000;

export interface EffectiveTimeBounds {
  /** Untergrenze: nicht vor Erstellung der Session bzw. dem Download des Pakets. */
  notBefore?: Date | null;
}

export interface EffectiveTime {
  at: Date;
  /** Zu alt für eine zeitgenaue Verbuchung: nur ins Protokoll, der Lernzustand bleibt unverändert. */
  tooOld: boolean;
  /** Der Zeitpunkt wurde angepasst (Zukunft → Serverzeit, vor der Untergrenze → Untergrenze). */
  adjusted: boolean;
}

export function effectiveTime(clientTime: string | Date | null | undefined, bounds: EffectiveTimeBounds, now: Date): EffectiveTime {
  const parsed = clientTime instanceof Date ? clientTime : typeof clientTime === "string" ? new Date(clientTime) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return { at: now, tooOld: false, adjusted: clientTime != null };
  if (parsed.getTime() > now.getTime() + CLOCK_SKEW_TOLERANCE_MS) return { at: now, tooOld: false, adjusted: true };
  let at = parsed.getTime() > now.getTime() ? now : parsed;
  let adjusted = at !== parsed;
  const floor = bounds.notBefore;
  if (floor && at.getTime() < floor.getTime()) {
    at = floor;
    adjusted = true;
  }
  return { at, tooOld: now.getTime() - at.getTime() > MAX_EVENT_AGE_MS, adjusted };
}

/** Zeitpunkte für die Verbuchung eines Sync-Ereignisses: eines je Antwort, dazu der Abschluss. */
export interface ReviewTiming {
  /** Abschlusszeitpunkt des Ereignisses (Session/Versuch). */
  completedAt: Date;
  /** Zeitpunkt einer einzelnen Antwort; ohne `answeredAt` gilt der Zeitpunkt des Ereignisses. */
  forAnswer(answeredAt?: string | null): EffectiveTime;
}

export function createReviewTiming(params: { eventTime: string | Date; notBefore?: Date | null; now?: Date }): ReviewTiming {
  const now = params.now ?? new Date();
  const bounds = { notBefore: params.notBefore ?? null };
  const event = effectiveTime(params.eventTime, bounds, now);
  return {
    completedAt: event.at,
    forAnswer(answeredAt) {
      if (answeredAt == null) return event;
      const answer = effectiveTime(answeredAt, bounds, now);
      // Eine Antwort liegt nie nach dem Abschluss des Ereignisses.
      return answer.at.getTime() > event.at.getTime() ? { ...answer, at: event.at, adjusted: true } : answer;
    },
  };
}

/** Zeitangaben einer Antwort für `recordReviewOutcomes`: Antwortzeitpunkt, Zustand nur ändern, wenn das Ereignis nicht zu alt ist. */
export function answerTime(timing: ReviewTiming, answeredAt?: string | null): { at: Date; applyState: boolean } {
  const { at, tooOld } = timing.forAnswer(answeredAt);
  return { at, applyState: !tooOld };
}
