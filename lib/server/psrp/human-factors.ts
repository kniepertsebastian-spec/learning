/**
 * Menschliche Faktoren, Stufe 1 (Aufgabe 14, Review 12.11.2026): Aufschieben (4.4), Regelmäßigkeit (4.5) und Schlaf zwischen
 * Lernen und Abruf (4.11). Reine Berechnung ohne Datenbank, nur beschreibend: sie ändert nichts an der Planung. Jeder Wert nennt
 * seinen Nenner `n`; unter `MIN_N` gilt er als „klein“, also nur anzusehen, nicht zu deuten (docs/MESSEN.md).
 *
 * Schlaf wird nicht als Angabe erhoben (Messregel 6). Ob eine Nacht zwischen Lektion und Rückblick lag, folgt allein aus den
 * Zeitstempeln und der Zeitzone der Person.
 */
import type { EvaluationGroup } from "@/lib/server/db/schema";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Unter so vielen Einheiten im Nenner ist ein Wert „klein“ (wie bei den Kennzahlen in docs/MESSEN.md). */
export const MIN_N = 20;
/** Mindestzahl Reviews, damit die Streuung der Lernzeiten einer Person zählt. */
export const MIN_REVIEWS_PER_PERSON = 10;
/** Abrufwahrscheinlichkeit vor dem Review, unter der ein Review als deutlich nach der Fälligkeit gilt (FSRS plant bei etwa 0,9). */
export const LATE_RETRIEVABILITY = 0.8;
/** Häufung vor der Prüfung: Reviews der letzten 7 von 28 Tagen vor dem Termin. Bei gleichmäßigem Lernen wären es 25 %. */
export const CRAMMING_WINDOW_DAYS = 7;
export const CRAMMING_BASE_DAYS = 28;
/** „Nacht dazwischen“: die lokale Uhrzeit 03:00 liegt zwischen Lektion und Rückblick. */
export const NIGHT_LOCAL_HOUR = 3;
/** Die Empfehlung „abends lernen, morgens abrufen“ ist erst sichtbar, wenn beide Seiten mindestens so viele Rückblicke haben und der Unterschied mindestens so groß ist. */
export const SLEEP_EFFECT_MIN_N = 20;
export const SLEEP_EFFECT_MIN_DIFFERENCE = 0.1;

export interface HumanFactorsReview {
  at: Date;
  /** Lokale Stunde (0-23) und ISO-Wochentag (1-7) in der Zeitzone der Person, wie im review_log. */
  localHour: number;
  weekday: number;
  predictedR: number | null;
  certificationId: string | null;
}

export interface HumanFactorsRecall {
  lessonCompletedAt: Date;
  hoursSinceLesson: number;
  status: "offered" | "answered" | "skipped";
  questionCount: number;
  correctCount: number | null;
}

export interface HumanFactorsUser {
  userHash: string;
  group: EvaluationGroup;
  timeZone: string;
  weeklyGoalDays: number;
  reviews: HumanFactorsReview[];
  /** Für Items, die zum Stichtag fällig und noch nicht wiederholt sind: Tage seit der Fälligkeit. */
  overdueDays: number[];
  exams: Array<{ certificationId: string; at: Date }>;
  recallChecks: HumanFactorsRecall[];
}

export interface Summary {
  /** Anzahl der Einheiten (Personen, Wochen, Reviews …), über die der Wert gebildet ist. */
  n: number;
  small: boolean;
  median: number | null;
}

export interface Share {
  numerator: number;
  n: number;
  small: boolean;
  share: number | null;
}

export interface SleepArm {
  /** Beantwortete Rückblicke. */
  n: number;
  small: boolean;
  questions: number;
  correct: number;
  accuracy: number | null;
}

export interface HumanFactors {
  /** 4.4 Aufschieben. */
  procrastination: {
    /** Personen mit mindestens einem überfälligen Item am Stichtag, und wie viele Tage es im Median überfällig ist (je Person der Median, darüber der Median). */
    backlog: { persons: number; withBacklog: number; overdueItems: number; medianDaysOverdue: Summary };
    /** Reviews mit bekannter Abrufwahrscheinlichkeit; „spät“ = darunter `LATE_RETRIEVABILITY`. Näherung: die genaue Fälligkeit steht nicht im review_log. */
    lateness: Share & { medianPredictedR: number | null };
    /** Anteil der Reviews der letzten Woche an denen der letzten vier Wochen vor einem Prüfungstermin (gleichmäßig wären 0,25). */
    cramming: Share & { exams: number; expectedShare: number };
  };
  /** 4.5 Regelmäßigkeit. */
  regularity: {
    /** Kreisförmige Standardabweichung der lokalen Lernstunde je Person in Stunden (0 = immer dieselbe Zeit), Person ab `MIN_REVIEWS_PER_PERSON` Reviews. */
    hourSpreadHours: Summary;
    /** An wie vielen der 7 Wochentage die Person gelernt hat (Median über Personen). */
    weekdaysUsed: Summary;
    /** Abgeschlossene Wochen, in denen mindestens so viele Tage gelernt wurden wie das Wochenziel; dazu das Verhältnis tatsächliche Tage zum Ziel. */
    weeklyGoal: Share & { medianRatio: number | null };
  };
  /** 4.11 Schlaf: Rückblicke mit und ohne Nacht zwischen Lektion und Abruf. */
  sleep: {
    withNight: SleepArm;
    withoutNight: SleepArm;
    /** Unterschied der Trefferquote (mit Nacht minus ohne); null, solange eine Seite keine Antworten hat. */
    difference: number | null;
    /** Erst wahr, wenn beide Seiten `SLEEP_EFFECT_MIN_N` Rückblicke haben und der Unterschied mindestens `SLEEP_EFFECT_MIN_DIFFERENCE` beträgt. Nur dann darf eine Empfehlung erscheinen. */
    recommendationSupported: boolean;
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const summary = (values: number[]): Summary => ({ n: values.length, small: values.length < MIN_N, median: median(values) });
const share = (numerator: number, n: number): Share => ({ numerator, n, small: n < MIN_N, share: n > 0 ? numerator / n : null });

/** Kreisförmige Standardabweichung von Uhrzeiten in Stunden: 23 Uhr und 1 Uhr liegen nah beieinander. 0 bei immer gleicher Zeit. */
export function circularSpreadHours(hours: number[]): number | null {
  if (hours.length === 0) return null;
  const angles = hours.map((h) => (h / 24) * 2 * Math.PI);
  const c = angles.reduce((s, a) => s + Math.cos(a), 0) / angles.length;
  const s = angles.reduce((acc, a) => acc + Math.sin(a), 0) / angles.length;
  const r = Math.min(1, Math.hypot(c, s));
  if (r < 1e-9) return 12;
  return (Math.sqrt(-2 * Math.log(r)) * 24) / (2 * Math.PI);
}

export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Montag der UTC-Woche (JJJJ-MM-TT), zu der ein Tag gehört. */
function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return utcDay(new Date(d.getTime() - offset * DAY_MS));
}

/** Liegt zwischen `from` und `to` die lokale Uhrzeit 03:00 in `timeZone`? Prüft im 30-Minuten-Raster, damit Sommerzeit und halbe Stunden stimmen. */
export function nightBetween(from: Date, to: Date, timeZone: string): boolean {
  if (to.getTime() - from.getTime() >= 24 * HOUR_MS) return true;
  if (to <= from) return false;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone });
  } catch {
    format = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "UTC" });
  }
  for (let t = from.getTime(); t <= to.getTime(); t += HOUR_MS / 2) {
    if (Number(format.format(new Date(t))) === NIGHT_LOCAL_HOUR) return true;
  }
  return false;
}

function procrastination(people: HumanFactorsUser[], asOf: Date): HumanFactors["procrastination"] {
  const perPersonOverdue = people.flatMap((p) => (p.overdueDays.length ? [median(p.overdueDays) as number] : []));
  const withR = people.flatMap((p) => p.reviews.flatMap((r) => (r.predictedR === null ? [] : [r.predictedR])));

  let exams = 0;
  let inBase = 0;
  let inWindow = 0;
  for (const p of people) {
    for (const exam of p.exams) {
      if (exam.at > asOf) continue;
      exams++;
      const start = exam.at.getTime() - CRAMMING_BASE_DAYS * DAY_MS;
      for (const r of p.reviews) {
        if (r.certificationId !== exam.certificationId) continue;
        const t = r.at.getTime();
        if (t < start || t >= exam.at.getTime()) continue;
        inBase++;
        if (t >= exam.at.getTime() - CRAMMING_WINDOW_DAYS * DAY_MS) inWindow++;
      }
    }
  }
  return {
    backlog: {
      persons: people.length,
      withBacklog: perPersonOverdue.length,
      overdueItems: people.reduce((s, p) => s + p.overdueDays.length, 0),
      medianDaysOverdue: summary(perPersonOverdue),
    },
    lateness: { ...share(withR.filter((r) => r < LATE_RETRIEVABILITY).length, withR.length), medianPredictedR: median(withR) },
    cramming: { ...share(inWindow, inBase), exams, expectedShare: CRAMMING_WINDOW_DAYS / CRAMMING_BASE_DAYS },
  };
}

function regularity(people: HumanFactorsUser[], asOf: Date): HumanFactors["regularity"] {
  const spreads: number[] = [];
  const weekdays: number[] = [];
  let weeks = 0;
  let met = 0;
  const ratios: number[] = [];
  const currentWeek = weekStart(utcDay(asOf));
  for (const p of people) {
    if (p.reviews.length >= MIN_REVIEWS_PER_PERSON) {
      spreads.push(circularSpreadHours(p.reviews.map((r) => r.localHour)) as number);
      weekdays.push(new Set(p.reviews.map((r) => r.weekday)).size);
    }
    // Nur abgeschlossene Wochen ab der ersten Woche mit Review; die laufende Woche ist noch nicht entschieden.
    const days = new Set(p.reviews.map((r) => utcDay(r.at)));
    const daysByWeek = new Map<string, number>();
    for (const day of days) daysByWeek.set(weekStart(day), (daysByWeek.get(weekStart(day)) ?? 0) + 1);
    if (days.size === 0) continue;
    const first = [...daysByWeek.keys()].sort()[0];
    for (let w = new Date(`${first}T00:00:00Z`); utcDay(w) < currentWeek; w = new Date(w.getTime() + 7 * DAY_MS)) {
      const actual = daysByWeek.get(utcDay(w)) ?? 0;
      weeks++;
      if (actual >= p.weeklyGoalDays) met++;
      ratios.push(actual / p.weeklyGoalDays);
    }
  }
  return {
    hourSpreadHours: summary(spreads),
    weekdaysUsed: summary(weekdays),
    weeklyGoal: { ...share(met, weeks), medianRatio: median(ratios) },
  };
}

function sleep(people: HumanFactorsUser[]): HumanFactors["sleep"] {
  const arms = { withNight: [] as HumanFactorsRecall[], withoutNight: [] as HumanFactorsRecall[] };
  for (const p of people) {
    for (const c of p.recallChecks) {
      if (c.status !== "answered" || c.questionCount <= 0 || c.correctCount === null) continue;
      const end = new Date(c.lessonCompletedAt.getTime() + c.hoursSinceLesson * HOUR_MS);
      (nightBetween(c.lessonCompletedAt, end, p.timeZone) ? arms.withNight : arms.withoutNight).push(c);
    }
  }
  const arm = (list: HumanFactorsRecall[]): SleepArm => {
    const questions = list.reduce((s, c) => s + c.questionCount, 0);
    const correct = list.reduce((s, c) => s + (c.correctCount ?? 0), 0);
    return { n: list.length, small: list.length < MIN_N, questions, correct, accuracy: questions > 0 ? correct / questions : null };
  };
  const withNight = arm(arms.withNight);
  const withoutNight = arm(arms.withoutNight);
  const difference = withNight.accuracy !== null && withoutNight.accuracy !== null ? withNight.accuracy - withoutNight.accuracy : null;
  return {
    withNight,
    withoutNight,
    difference,
    recommendationSupported: difference !== null && withNight.n >= SLEEP_EFFECT_MIN_N && withoutNight.n >= SLEEP_EFFECT_MIN_N && difference >= SLEEP_EFFECT_MIN_DIFFERENCE,
  };
}

export function computeHumanFactors(people: HumanFactorsUser[], asOf: Date): HumanFactors {
  return { procrastination: procrastination(people, asOf), regularity: regularity(people, asOf), sleep: sleep(people) };
}

/** Die Werte gesamt und je Evaluationsgruppe (nur Personen mit Gruppe, wie bei den übrigen Kennzahlen). */
export function computeHumanFactorsByGroup(people: HumanFactorsUser[], asOf: Date) {
  const groups = [...new Set(people.map((p) => p.group))].sort();
  return {
    all: computeHumanFactors(people, asOf),
    byGroup: Object.fromEntries(groups.map((g) => [g, computeHumanFactors(people.filter((p) => p.group === g), asOf)])) as Partial<Record<EvaluationGroup, HumanFactors>>,
  };
}
