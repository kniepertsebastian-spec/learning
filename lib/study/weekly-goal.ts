/**
 * Motivation ohne Strafe (roadmap_didaktik Phase 5 und 6): Wochenziel statt Tagesserie, Serienschutz, Willkommen-zurück und schrittweise
 * Einführung der Zusatz-Eingaben. Reine Regeln ohne DB; Tage zählen in der Zeitzone der Person.
 */

export const DEFAULT_WEEKLY_GOAL_DAYS = 4;
/** Nach so vielen Tagen ohne Session gibt es „Willkommen zurück“ statt einer Rückstand-Zahl. */
export const WELCOME_BACK_DAYS = 7;
/** Ab der wievielten abgeschlossenen Session die Sicherheitsangabe (3. Session = nach 2 abgeschlossenen) bzw. der Check-in (5. Session) angeboten wird. */
export const CONFIDENCE_AFTER_COMPLETED = 2;
export const CHECKIN_AFTER_COMPLETED = 4;

const DAY_MS = 86_400_000;

/** Kalendertag als `YYYY-MM-DD` in der Zeitzone der Person. */
export function dayKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const parseKey = (key: string) => new Date(`${key}T12:00:00Z`);
const addDays = (key: string, n: number) => new Date(parseKey(key).getTime() + n * DAY_MS).toISOString().slice(0, 10);
/** 0 = Sonntag ... 6 = Samstag (wie `study_profiles.light_weekdays`). */
const weekdayOf = (key: string) => parseKey(key).getUTCDay();
/** Montag der Woche des Tages. */
const mondayOf = (key: string) => addDays(key, -((weekdayOf(key) + 6) % 7));

export interface WeeklyProgress {
  /** Lerntage in dieser Woche (Montag bis Sonntag). */
  daysLearned: number;
  /** Ziel in Lerntagen; leichte Tage zählen nicht gegen das Ziel (mindestens 1). */
  goal: number;
  reached: boolean;
}

/** „x von 4 Lerntagen diese Woche“. Leichte Wochentage verkleinern das Ziel, damit sie nicht gegen die Person zählen. */
export function weeklyProgress(input: { completedAt: Date[]; now: Date; timeZone: string; lightWeekdays?: readonly number[]; goalDays?: number }): WeeklyProgress {
  const today = dayKey(input.now, input.timeZone);
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const days = new Set(input.completedAt.map((d) => dayKey(d, input.timeZone)).filter((k) => k >= monday && k <= sunday));
  const light = new Set(input.lightWeekdays ?? []);
  const base = Math.min(7, Math.max(1, input.goalDays ?? DEFAULT_WEEKLY_GOAL_DAYS));
  const goal = Math.max(1, Math.min(base, 7 - light.size));
  return { daysLearned: days.size, goal, reached: days.size >= goal };
}

/**
 * Serie mit Serienschutz: ein Tag Pause pro Woche und alle leichten Wochentage brechen sie nicht. Gezählt werden die Lerntage der Serie.
 * Heute zählt nicht als Pause (der Tag ist noch nicht vorbei).
 */
export function protectedStreak(input: { completedAt: Date[]; now: Date; timeZone: string; lightWeekdays?: readonly number[] }): number {
  const today = dayKey(input.now, input.timeZone);
  const learned = new Set(input.completedAt.map((d) => dayKey(d, input.timeZone)));
  const light = new Set(input.lightWeekdays ?? []);
  let streak = learned.has(today) ? 1 : 0;
  let lastFreeMiss: string | null = null;
  for (let i = 1; i <= 400; i++) {
    const key = addDays(today, -i);
    if (learned.has(key)) {
      streak++;
      continue;
    }
    if (light.has(weekdayOf(key))) continue;
    // Eine freie Pause pro Woche: die nächste Lücke bricht die Serie, wenn die vorige weniger als 7 Tage zurückliegt.
    if (lastFreeMiss === null || (parseKey(lastFreeMiss).getTime() - parseKey(key).getTime()) / DAY_MS >= 7) {
      lastFreeMiss = key;
      continue;
    }
    break;
  }
  return streak;
}

/** Nach einer längeren Pause (≥ 7 Tage seit der letzten abgeschlossenen Session, mindestens eine davor): Begrüßung statt Rückstand-Zahl. */
export function isWelcomeBack(lastCompletedAt: Date | null, now: Date): boolean {
  return lastCompletedAt !== null && now.getTime() - lastCompletedAt.getTime() >= WELCOME_BACK_DAYS * DAY_MS;
}

export interface LearningPreferences {
  weeklyGoalDays: number;
  showStreak: boolean;
  askConfidence: boolean;
  offerCheckin: boolean;
}

export const DEFAULT_PREFERENCES: LearningPreferences = { weeklyGoalDays: DEFAULT_WEEKLY_GOAL_DAYS, showStreak: false, askConfidence: true, offerCheckin: true };

export interface IntroStage {
  /** Erste Session: nur „Starten“, keine Zusatz-Eingaben. */
  firstSession: boolean;
  /** Sicherheitsangabe ab der 3. Session (und wenn die Person sie nicht abgeschaltet hat). */
  askConfidence: boolean;
  /** Check-in zur Tagesform ab der 5. Session (und wenn die Person ihn nicht abgeschaltet hat). */
  offerCheckin: boolean;
}

/** Schrittweise Einführung der Zusatz-Eingaben; die Person kann beide jederzeit abschalten („Wie ich lerne“). */
export function introStage(completedSessions: number, prefs: Pick<LearningPreferences, "askConfidence" | "offerCheckin"> = DEFAULT_PREFERENCES): IntroStage {
  return {
    firstSession: completedSessions === 0,
    askConfidence: prefs.askConfidence && completedSessions >= CONFIDENCE_AFTER_COMPLETED,
    offerCheckin: prefs.offerCheckin && completedSessions >= CHECKIN_AFTER_COMPLETED,
  };
}
