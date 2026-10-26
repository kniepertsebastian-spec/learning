/**
 * Prüfungsplaner (UI U8): reine Logik ohne Datenbank – Lernplan rückwärts, Bereitschaft, Kalender-Export, Erinnerungen.
 * Schwelle und Anzahl der Simulationen stehen nur hier.
 */
export const READY_THRESHOLD = 80;
export const READY_STREAK = 3;
export const DEFAULT_WEEKLY_HOURS = 5;
/** Annahme für Lektionen ohne Zeitangabe. */
export const DEFAULT_LESSON_MINUTES = 20;

export type PlannedLesson = { id: string; title: string; minutes: number | null; done: boolean };
export type WeekKind = "learn" | "simulate" | "review";
export type PlanWeek = {
  /** Montag der Woche (UTC, ISO-Datum) */
  start: string;
  /** ISO-Kalenderwoche */
  kw: number;
  kind: WeekKind;
  /** Titel der Lektionen bzw. schwache Themen dieser Woche */
  topics: string[];
  lessonIds: string[];
  plannedMinutes: number;
  simulations: number;
};

export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Bereitschaft: die letzten READY_STREAK Simulationen alle ≥ READY_THRESHOLD. `scores` neueste zuletzt. */
export function readiness(scores: number[]): { reached: number; ready: boolean; last: Array<number | null> } {
  const last = scores.slice(-READY_STREAK);
  let reached = 0;
  for (let i = last.length - 1; i >= 0 && last[i] >= READY_THRESHOLD; i--) reached++;
  const slots: Array<number | null> = [...last, ...Array(READY_STREAK - last.length).fill(null)];
  return { reached, ready: reached >= READY_STREAK, last: slots };
}

/**
 * Lernplan rückwärts vom Prüfungstermin: Prüfungswoche = nur Wiederholung und Merkzettel, die Woche davor = zwei Simulationen,
 * davor werden die offenen Lektionen nach Zeitbudget (Wochenziel) auf die Wochen verteilt; schwache Themen kommen in die
 * Lernwochen. Bleibt zu wenig Zeit, nehmen die frühen Wochen mehr auf (Überlauf wird gemeldet). Ohne Termin: kein Plan.
 */
export function buildStudyPlan(input: {
  examDate: Date | null;
  now: Date;
  lessons: PlannedLesson[];
  weakTopics: string[];
  weeklyHours?: number;
}): { weeks: PlanWeek[]; overflowMinutes: number } {
  if (!input.examDate) return { weeks: [], overflowMinutes: 0 };
  const weeklyMinutes = Math.max(1, Math.round((input.weeklyHours ?? DEFAULT_WEEKLY_HOURS) * 60));
  const first = mondayOf(input.now);
  const last = mondayOf(input.examDate);
  if (last.getTime() < first.getTime()) return { weeks: [], overflowMinutes: 0 };

  const starts: Date[] = [];
  for (let d = new Date(first); d.getTime() <= last.getTime(); d = new Date(d.getTime() + 7 * 86_400_000)) starts.push(d);

  const open = input.lessons.filter((l) => !l.done);
  const weeks: PlanWeek[] = starts.map((s) => ({ start: iso(s), kw: isoWeek(s), kind: "learn", topics: [], lessonIds: [], plannedMinutes: 0, simulations: 0 }));
  const n = weeks.length;
  // Letzte Woche: Wiederholung; vorletzte (falls es mehr als zwei Wochen gibt): zwei Simulationen.
  weeks[n - 1].kind = "review";
  weeks[n - 1].topics = input.weakTopics.slice(0, 3);
  if (n >= 3) {
    weeks[n - 2].kind = "simulate";
    weeks[n - 2].simulations = 2;
    weeks[n - 2].topics = input.weakTopics.slice(0, 3);
  }
  const learnWeeks = weeks.filter((w) => w.kind === "learn");

  let overflow = 0;
  if (learnWeeks.length === 0) {
    overflow = open.reduce((sum, l) => sum + (l.minutes ?? DEFAULT_LESSON_MINUTES), 0);
  } else {
    let wi = 0;
    for (const lesson of open) {
      const mins = lesson.minutes ?? DEFAULT_LESSON_MINUTES;
      while (wi < learnWeeks.length - 1 && learnWeeks[wi].plannedMinutes + mins > weeklyMinutes && learnWeeks[wi].plannedMinutes > 0) wi++;
      const w = learnWeeks[wi];
      w.lessonIds.push(lesson.id);
      w.topics.push(lesson.title);
      w.plannedMinutes += mins;
    }
    const lastLearn = learnWeeks[learnWeeks.length - 1];
    overflow = Math.max(0, lastLearn.plannedMinutes - weeklyMinutes);
    // Schwache Themen in die ersten Lernwochen mit Platz verteilen
    input.weakTopics.slice(0, learnWeeks.length).forEach((t, i) => learnWeeks[i % learnWeeks.length].topics.push(t));
  }
  return { weeks, overflowMinutes: overflow };
}

/** Rückstand in Prozent: geplante Lektionen vergangener Wochen, die noch offen sind. Über 20 % wird neu verteilt. */
export function backlogPercent(weeks: PlanWeek[], doneLessonIds: ReadonlySet<string>, now: Date): number {
  const monday = iso(mondayOf(now));
  const past = weeks.filter((w) => w.start < monday);
  const planned = past.flatMap((w) => w.lessonIds);
  if (planned.length === 0) return 0;
  return Math.round((planned.filter((id) => !doneLessonIds.has(id)).length / planned.length) * 100);
}

export const REPLAN_BACKLOG_PERCENT = 20;

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
/** Zeilenlänge laut RFC 5545 (75 Oktette): umbrechen mit Leerzeichen-Fortsetzung. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

/** Kalenderdatei (.ics): Prüfungstermin und optional wöchentliche Lernblöcke. Keine externe Kalender-API. */
export function buildIcs(input: { uidBase: string; title: string; examAt: Date; durationMinutes?: number; now: Date; location?: string; studyWeeks?: Array<{ start: string; title: string; minutes: number }> }): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Knowvia//Pruefungsplaner//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  const end = new Date(input.examAt.getTime() + (input.durationMinutes ?? 120) * 60_000);
  lines.push("BEGIN:VEVENT", `UID:exam-${input.uidBase}@proofpath`, `DTSTAMP:${icsStamp(input.now)}`, `DTSTART:${icsStamp(input.examAt)}`, `DTEND:${icsStamp(end)}`, `SUMMARY:${icsEscape(input.title)}`);
  if (input.location) lines.push(`LOCATION:${icsEscape(input.location)}`);
  lines.push("BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(input.title)}`, "END:VALARM", "END:VEVENT");
  (input.studyWeeks ?? []).forEach((w, i) => {
    const start = new Date(`${w.start}T17:00:00Z`);
    const stop = new Date(start.getTime() + Math.max(30, w.minutes) * 60_000);
    lines.push("BEGIN:VEVENT", `UID:study-${input.uidBase}-${i}@proofpath`, `DTSTAMP:${icsStamp(input.now)}`, `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(stop)}`, `SUMMARY:${icsEscape(w.title)}`, "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export type PlanReminder = "voucher_expiring" | "exam_soon" | "retake_included";

/** Erinnerungen zu einem Plan: Voucher läuft innerhalb von 30 Tagen ab, Prüfung in höchstens 7 Tagen, Wiederholungsversuch enthalten (nach nicht bestandener Prüfung). */
export function planReminders(plan: { scheduledAt: Date | null; voucherExpiresAt: Date | null; retakeIncluded: boolean; status: "planned" | "passed" | "failed" | "cancelled" }, now: Date): PlanReminder[] {
  const out: PlanReminder[] = [];
  if (plan.status === "cancelled" || plan.status === "passed") return out;
  const days = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  if (plan.voucherExpiresAt && days(plan.voucherExpiresAt) >= 0 && days(plan.voucherExpiresAt) <= 30) out.push("voucher_expiring");
  if (plan.status === "planned" && plan.scheduledAt && days(plan.scheduledAt) >= 0 && days(plan.scheduledAt) <= 7) out.push("exam_soon");
  if (plan.status === "failed" && plan.retakeIncluded) out.push("retake_included");
  return out;
}
