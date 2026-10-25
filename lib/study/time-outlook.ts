/**
 * „Reicht die Zeit?“ beim Setzen des Lernziels: vergleicht den geschätzten Restaufwand mit der Zeit bis zum Prüfungstermin
 * (aktive Lerntage × Tagesziel). Reine Funktionen, damit sie im Formular sofort und ohne Server neu rechnen. Die Zahlen sind
 * grobe Schätzungen; das Ziel darf sich schieben, deshalb nennt das Ergebnis auch einen Termin, der passen würde.
 */

/** Minuten je Frage: erste Begegnung mit Feedback plus eine Wiederholung (grobe Annahme). */
export const MINUTES_PER_NEW_QUESTION = 2;
/** Eine Frage der Tages-Session dauert etwa eine Minute (siehe MINUTES_PER_SESSION_QUESTION). */
export const MINUTES_PER_DAILY_QUESTION = 1;

export type OutlookStatus = "ok" | "tight" | "short";

export interface TimeOutlook {
  /** Lerntage ab heute (einschließlich) bis vor dem Prüfungstag. */
  studyDays: number;
  availableMinutes: number;
  neededMinutes: number;
  status: OutlookStatus;
  /** Minuten pro aktivem Lerntag, mit denen es genau reicht (aufgerundet). */
  neededPerDay: number | null;
  /** Frühester Prüfungstermin, bis zu dem die Zeit mit dem jetzigen Tagesziel reicht (mit etwas Puffer); null, wenn es schon reicht. */
  suggestedExamDate: string | null;
}

export function remainingNeededMinutes(workload: { lessonMinutes: number; unseenQuestions: number }): number {
  return Math.max(0, Math.round(workload.lessonMinutes + workload.unseenQuestions * MINUTES_PER_NEW_QUESTION));
}

export function dailyMinutes(goalType: "minutes" | "questions", goalValue: number): number {
  return goalType === "minutes" ? goalValue : goalValue * MINUTES_PER_DAILY_QUESTION;
}

function isoWeekday(date: Date): number {
  const d = date.getUTCDay();
  return d === 0 ? 7 : d;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Aktive Lerntage in [from, until) nach Kalendertag (UTC-Tage reichen für diese Schätzung). */
export function countStudyDays(from: Date, until: Date, activeDays: number[]): number {
  const active = new Set(activeDays);
  let count = 0;
  for (let d = startOfUtcDay(from); d.getTime() < startOfUtcDay(until).getTime(); d = new Date(d.getTime() + 86_400_000)) {
    if (active.has(isoWeekday(d))) count++;
  }
  return count;
}

/** `null`, wenn es keinen Prüfungstermin (oder keinen in der Zukunft) gibt oder nichts mehr zu tun ist. */
export function computeTimeOutlook(input: { examDate: string | null; now: Date; activeDays: number[]; minutesPerDay: number; neededMinutes: number }): TimeOutlook | null {
  if (!input.examDate || input.neededMinutes <= 0 || input.activeDays.length === 0 || input.minutesPerDay <= 0) return null;
  const exam = new Date(`${input.examDate}T00:00:00Z`);
  if (Number.isNaN(exam.getTime()) || exam.getTime() <= startOfUtcDay(input.now).getTime()) return null;
  const studyDays = countStudyDays(input.now, exam, input.activeDays);
  const availableMinutes = studyDays * input.minutesPerDay;
  const status: OutlookStatus = availableMinutes >= input.neededMinutes * 1.2 ? "ok" : availableMinutes >= input.neededMinutes ? "tight" : "short";
  const neededPerDay = studyDays > 0 ? Math.ceil(input.neededMinutes / studyDays) : null;
  let suggestedExamDate: string | null = null;
  if (status !== "ok") {
    // Tag für Tag weiterzählen, bis die Zeit samt 20 % Puffer reicht (höchstens ein Jahr).
    const active = new Set(input.activeDays);
    let minutes = availableMinutes;
    let day = exam;
    for (let i = 0; i < 365 && minutes < input.neededMinutes * 1.2; i++) {
      if (active.has(isoWeekday(day))) minutes += input.minutesPerDay;
      day = new Date(day.getTime() + 86_400_000);
    }
    suggestedExamDate = day.toISOString().slice(0, 10);
  }
  return { studyDays, availableMinutes, neededMinutes: input.neededMinutes, status, neededPerDay, suggestedExamDate };
}
