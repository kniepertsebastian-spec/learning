import { c_pushMessages } from "@/lib/i18n/components/pushMessages";
import { fill } from "@/lib/i18n/fill";
import type { PushKind } from "@/lib/server/db/schema";

/**
 * Web Push (docs/roadmaps/archiv/roadmap_pwa.md, Phase 6), reine Regeln ohne Datenbank und Netz: wann eine Person erinnert wird und was in der
 * Nachricht steht. Die Uhrzeit und die Lerntage kommen aus dem Review-Log der Wiederholungsplanung (PSRP-HR: je Review die lokale
 * Stunde und der Wochentag in der Zeitzone der Person), nicht aus einer eigenen Einstellung.
 */

export const DEFAULT_REMINDER_HOUR = 18;
/** Nie nachts: die übliche Lernzeit wird in dieses Fenster geschoben. */
export const EARLIEST_HOUR = 8;
export const LATEST_HOUR = 21;
/** Erinnerungen kommen ab der üblichen Stunde und noch bis zu so viele Stunden danach (falls ein stündlicher Lauf ausfällt). */
export const WINDOW_HOURS = 3;
/** Ab so vielen Reviews kennen wir die übliche Lernzeit; vorher gilt der Standard. */
export const MIN_HOUR_SAMPLES = 5;
/** Ab so vielen Lerntagen kennen wir die Wochentage; vorher gilt jeder Tag. */
export const MIN_STUDY_DAYS_FOR_WEEKDAYS = 8;
/** „Dosiert“: erst ab so vielen fälligen Fragen und ab so langer Serie lohnt eine Nachricht. */
export const MIN_DUE_FOR_PUSH = 3;
export const MIN_STREAK_FOR_PUSH = 3;

export interface LocalParts {
  /** Lokales Datum „YYYY-MM-DD“. */
  dateKey: string;
  hour: number;
  /** ISO-Wochentag, 1 = Montag … 7 = Sonntag (wie `review_log.weekday`). */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Datum, Stunde und Wochentag eines Zeitpunkts in einer Zeitzone; eine ungültige Zeitzone fällt auf Europe/Berlin zurück. */
export function localParts(date: Date, timeZone: string): LocalParts {
  const make = (zone: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(date);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = make(timeZone);
  } catch {
    parts = make("Europe/Berlin");
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { dateKey: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), weekday: WEEKDAYS[get("weekday")] ?? 1 };
}

/** Die übliche Lernstunde: Median der lokalen Stunden der Reviews, ins Fenster EARLIEST_HOUR bis LATEST_HOUR geschoben. */
export function pickReminderHour(hourCounts: Readonly<Record<number, number>>): number {
  const entries = Object.entries(hourCounts)
    .map(([hour, count]) => [Number(hour), count] as const)
    .filter(([hour, count]) => Number.isInteger(hour) && hour >= 0 && hour <= 23 && count > 0)
    .sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total < MIN_HOUR_SAMPLES) return DEFAULT_REMINDER_HOUR;
  let seen = 0;
  let median = DEFAULT_REMINDER_HOUR;
  for (const [hour, count] of entries) {
    seen += count;
    if (seen >= total / 2) {
      median = hour;
      break;
    }
  }
  return Math.min(LATEST_HOUR, Math.max(EARLIEST_HOUR, median));
}

/** Liegt die lokale Stunde im Fenster ab der üblichen Stunde? */
export function inReminderWindow(localHour: number, reminderHour: number): boolean {
  return localHour >= reminderHour && localHour < Math.min(reminderHour + WINDOW_HOURS, LATEST_HOUR + 1);
}

/**
 * Die Wochentage (1–7), an denen die Person tatsächlich lernt: mindestens zwei Lerntage an diesem Wochentag in den letzten Wochen. Wer
 * noch kaum gelernt hat, bekommt jeden Tag (sonst blieben neue Nutzer stumm).
 */
export function activeWeekdays(studyDaysByWeekday: Readonly<Record<number, number>>): Set<number> {
  const total = Object.values(studyDaysByWeekday).reduce((a, b) => a + b, 0);
  if (total < MIN_STUDY_DAYS_FOR_WEEKDAYS) return new Set([1, 2, 3, 4, 5, 6, 7]);
  return new Set([1, 2, 3, 4, 5, 6, 7].filter((d) => (studyDaysByWeekday[d] ?? 0) >= 2));
}

/** Der Vortag eines lokalen Datums („YYYY-MM-DD“). */
export function previousDayKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Länge der Serie, die heute abreißt: Heute wurde noch nicht gelernt, an den Tagen davor lückenlos. 0, wenn heute schon gelernt wurde
 * oder die Serie kürzer als MIN_STREAK_FOR_PUSH ist.
 */
export function streakAtRisk(studyDayKeys: ReadonlySet<string>, todayKey: string): number {
  if (studyDayKeys.has(todayKey)) return 0;
  let streak = 0;
  let cursor = previousDayKey(todayKey);
  while (studyDayKeys.has(cursor)) {
    streak++;
    cursor = previousDayKey(cursor);
  }
  return streak >= MIN_STREAK_FOR_PUSH ? streak : 0;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Wohin ein Tippen führt (nur ein Pfad der App, nie eine fremde Adresse). */
  url: string;
  /** Gleiche Art ersetzt sich im Benachrichtigungsfenster, statt sich zu stapeln. */
  tag: string;
}

type Lang = "de" | "en";

export function examPayload(kind: "exam_soon" | "voucher_expiring" | "retake_included", info: { courseName: string; daysUntil: number }, locale: Lang): PushPayload {
  const tx = c_pushMessages(locale);
  const days = Math.max(0, info.daysUntil);
  if (kind === "voucher_expiring") return { title: tx.voucherTitle, body: fill(tx.voucherBody, info.courseName, days), url: "/exams", tag: "voucher" };
  if (kind === "retake_included") return { title: tx.retakeTitle, body: fill(tx.retakeBody, info.courseName), url: "/exams", tag: "retake" };
  return { title: tx.examSoonTitle, body: days <= 1 ? fill(tx.examSoonBodyToday, info.courseName) : fill(tx.examSoonBody, info.courseName, days), url: "/exams", tag: "exam" };
}

export function reviewsDuePayload(count: number, locale: Lang): PushPayload {
  const tx = c_pushMessages(locale);
  return { title: tx.reviewsTitle, body: fill(tx.reviewsBody, count), url: "/", tag: "daily" };
}

export function streakRiskPayload(days: number, locale: Lang): PushPayload {
  const tx = c_pushMessages(locale);
  return { title: tx.streakTitle, body: fill(tx.streakBody, days), url: "/", tag: "daily" };
}

export function testPayload(locale: Lang): PushPayload {
  const tx = c_pushMessages(locale);
  return { title: tx.testTitle, body: tx.testBody, url: "/account", tag: "test" };
}

export type DailyKind = Extract<PushKind, "reviews_due" | "streak_risk">;
