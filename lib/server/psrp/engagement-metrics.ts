/**
 * Kennzahlen zu Abbruch, Rückkehr und Abschluss (roadmap_motivation Phase 10): reine Berechnung ohne Datenbank, beschreibend.
 * Sie dienen als Ausgangswert VOR dem Einschalten einer Mechanik (Notausstieg, Entlastung, Reaktivierung); Ziele legt man erst danach fest.
 */
import type { EvaluationGroup } from "@/lib/server/db/schema";

const DAY_MS = 86_400_000;
/** Eine Pause beginnt, wenn so viele Tage ohne abgeschlossene Session vergehen. */
export const PAUSE_DAYS = 7;

export interface EngagementUser {
  userHash: string;
  group: EvaluationGroup;
  /** Tage (JJJJ-MM-TT, UTC) mit mindestens einer abgeschlossenen Session, aufsteigend und ohne Doppelte. */
  sessionDays: string[];
  /** Abgeschlossene Sessions insgesamt. */
  sessions: number;
  /** Nutzungen des Notausstiegs „Heute reicht's“. */
  exits: number;
  /** Sessions, die wegen der Frühwarnung entlastet wurden. */
  deescalatedSessions: number;
  /** Kurse mit mindestens einer abgeschlossenen Lektion: erledigt und gesamt. */
  courses: Array<{ done: number; total: number }>;
}

export interface Rate {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface EngagementMetrics {
  /** Personen mit mindestens einer abgeschlossenen Session. */
  users: number;
  /** Anteil, der N Tage nach dem Start keine Session mehr hatte (nur Personen, die vor mehr als N Tagen begonnen haben). */
  churn7: Rate;
  churn30: Rate;
  /** Pausen von mindestens PAUSE_DAYS Tagen: beendet (Person kam zurück) gegenüber offen (noch nicht zurück). */
  returnAfterPause: Rate & { closed: number; open: number };
  /** Kurse mit begonnener Lernreihe, davon vollständig abgeschlossen (alle Lektionen). */
  courseCompletion: Rate;
  /** Anteil der Personen, die den Notausstieg mindestens einmal genutzt haben, und Nutzungen je 100 Sessions. */
  exit: Rate & { perHundredSessions: number | null };
  /** Anteil der Personen mit mindestens einer entlasteten Session. */
  deescalation: Rate;
}

const rate = (numerator: number, denominator: number): Rate => ({ numerator, denominator, rate: denominator > 0 ? numerator / denominator : null });
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Tag als JJJJ-MM-TT in UTC. */
export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

function churn(users: EngagementUser[], asOf: Date, days: number): Rate {
  const cutoff = asOf.getTime() - days * DAY_MS;
  const eligible = users.filter((u) => u.sessionDays.length > 0 && dayMs(u.sessionDays[0]) <= cutoff);
  const churned = eligible.filter((u) => dayMs(u.sessionDays[u.sessionDays.length - 1]) <= cutoff);
  return rate(churned.length, eligible.length);
}

function pauses(users: EngagementUser[], asOf: Date): { closed: number; open: number } {
  let closed = 0;
  let open = 0;
  for (const u of users) {
    const days = u.sessionDays.map(dayMs);
    for (let i = 1; i < days.length; i++) if (days[i] - days[i - 1] >= PAUSE_DAYS * DAY_MS) closed++;
    if (days.length > 0 && asOf.getTime() - days[days.length - 1] >= PAUSE_DAYS * DAY_MS) open++;
  }
  return { closed, open };
}

export function computeEngagement(users: EngagementUser[], asOf: Date): EngagementMetrics {
  const active = users.filter((u) => u.sessionDays.length > 0);
  const { closed, open } = pauses(active, asOf);
  const courses = active.flatMap((u) => u.courses).filter((c) => c.total > 0);
  const sessions = active.reduce((n, u) => n + u.sessions, 0);
  const exits = active.reduce((n, u) => n + u.exits, 0);
  return {
    users: active.length,
    churn7: churn(active, asOf, 7),
    churn30: churn(active, asOf, 30),
    returnAfterPause: { ...rate(closed, closed + open), closed, open },
    courseCompletion: rate(courses.filter((c) => c.done >= c.total).length, courses.length),
    exit: { ...rate(active.filter((u) => u.exits > 0).length, active.length), perHundredSessions: sessions > 0 ? (exits / sessions) * 100 : null },
    deescalation: rate(active.filter((u) => u.deescalatedSessions > 0).length, active.length),
  };
}

/** Gesamt und je Evaluationsgruppe. */
export function computeEngagementByGroup(users: EngagementUser[], asOf: Date): { all: EngagementMetrics; byGroup: Partial<Record<EvaluationGroup, EngagementMetrics>> } {
  const groups = [...new Set(users.map((u) => u.group))];
  return { all: computeEngagement(users, asOf), byGroup: Object.fromEntries(groups.map((g) => [g, computeEngagement(users.filter((u) => u.group === g), asOf)])) };
}
