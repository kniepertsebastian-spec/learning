/**
 * Menschliche Faktoren, Stufe 1 (Aufgabe 16, Review 12.11.2026): Lesetiefe (4.9), Durchhalten nach Fehlern (4.10) und Gerät (4.12).
 * Reine Berechnung ohne Datenbank, nur beschreibend: sie ändert nichts in der App. Jeder Wert nennt seinen Nenner `n`; unter
 * `MIN_N` gilt er als „klein“ (docs/MESSEN.md). Der Eingriff „leichtere Frage einschieben“ (4.10) und der Hinweis vor dem
 * Lektionstest (4.9) kommen erst, wenn diese Auswertung einen Effekt zeigt.
 */
import type { DeviceClass, EvaluationGroup } from "@/lib/server/db/schema";

export const MIN_N = 20;
/** Lesetempo (Wörter pro Minute), über dem eine Lektion als „kaum gelesen“ gilt. Aufmerksames Lesen liegt bei etwa 200 bis 300. */
export const SKIM_WORDS_PER_MINUTE = 600;
/** So viele „nochmal“-Antworten (Rating 1) in Folge zählen als Fehlerserie. */
export const FAILURE_STREAK = 3;

export interface ReadingRecord {
  /** Aktive Lesesekunden und wie oft die Lektion geöffnet wurde. */
  seconds: number;
  opens: number;
  /** Wörter der Lektion. */
  words: number;
  /** Ergebnis (0 bis 100) des ersten abgeschlossenen Lektionstests dieser Person zu dieser Lektion, falls vorhanden. */
  firstQuizScore: number | null;
}

export interface SessionRatings {
  /** Rohe Ratings (1 bis 4) der Reviews dieser Sitzung in zeitlicher Reihenfolge. */
  ratings: number[];
  /** Die Person hat die Sitzung mit dem Notausstieg „Heute reicht's“ beendet. */
  exited: boolean;
}

export interface DeviceSession {
  deviceClass: DeviceClass | null;
  answered: number;
  correct: number;
}

export interface SessionContextUser {
  group: EvaluationGroup;
  reading: ReadingRecord[];
  sessions: SessionRatings[];
  deviceSessions: DeviceSession[];
}

export interface Share {
  numerator: number;
  n: number;
  small: boolean;
  share: number | null;
}

export interface ScoreArm {
  n: number;
  small: boolean;
  meanScore: number | null;
}

export interface SessionContext {
  /** 4.9 Lesetiefe. */
  reading: {
    lessons: number;
    /** Lektionen mit Lesezeit, deren Tempo über `SKIM_WORDS_PER_MINUTE` liegt oder die ohne Lesezeit geöffnet wurden. */
    skimmed: Share;
    medianWordsPerMinute: number | null;
    /** Lektionen, die mehr als einmal geöffnet wurden. */
    reopened: Share;
    /** Ergebnis des ersten Lektionstests, getrennt nach „kaum gelesen“ und „gelesen“. */
    firstQuizScore: { skimmed: ScoreArm; read: ScoreArm; difference: number | null };
  };
  /** 4.10 Durchhalten: Was nach der dritten falschen Antwort in Folge passiert (höchstens eine Serie je Sitzung, die erste). */
  persistence: {
    sessionsWithStreak: number;
    continued: Share;
    exited: Share;
    /** Sitzung ohne weitere Antwort und ohne Notausstieg: abgebrochen oder pausiert. */
    ended: Share;
  };
  /** 4.12 Gerät: abgeschlossene Sitzungen je Größenklasse. */
  device: {
    narrow: DeviceArm;
    wide: DeviceArm;
    /** Abgeschlossene Sitzungen ohne Angabe (vor der Messung, Flag aus, älteres Gerät). */
    unknown: number;
  };
}

export interface DeviceArm {
  sessions: number;
  small: boolean;
  answered: number;
  correct: number;
  accuracy: number | null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const share = (numerator: number, n: number): Share => ({ numerator, n, small: n < MIN_N, share: n > 0 ? numerator / n : null });

/** Wörter eines Markdown-Textes: Teile mit mindestens einem Buchstaben oder einer Ziffer, ohne Codeblöcke (die liest man nicht wie Fließtext). */
export function countWords(markdown: string): number {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, " ");
  return withoutCode.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** Wörter pro Minute; null ohne Lesezeit oder ohne Text. */
export function wordsPerMinute(record: Pick<ReadingRecord, "seconds" | "words">): number | null {
  return record.seconds > 0 && record.words > 0 ? record.words / (record.seconds / 60) : null;
}

/** „Kaum gelesen“: ohne Lesezeit geöffnet oder schneller als `SKIM_WORDS_PER_MINUTE`. Lektionen ohne Text zählen nicht. */
export function isSkimmed(record: Pick<ReadingRecord, "seconds" | "words">): boolean {
  if (record.words <= 0) return false;
  const wpm = wordsPerMinute(record);
  return wpm === null || wpm > SKIM_WORDS_PER_MINUTE;
}

/** Ausgang nach der ersten Serie von `FAILURE_STREAK` falschen Antworten in Folge: weiter, Notausstieg oder Ende. Null, wenn es keine Serie gab. */
export function afterFailureStreak(session: SessionRatings): "continued" | "exited" | "ended" | null {
  let run = 0;
  for (let i = 0; i < session.ratings.length; i++) {
    run = session.ratings[i] === 1 ? run + 1 : 0;
    if (run === FAILURE_STREAK) {
      if (i < session.ratings.length - 1) return "continued";
      return session.exited ? "exited" : "ended";
    }
  }
  return null;
}

function scoreArm(scores: number[]): ScoreArm {
  return { n: scores.length, small: scores.length < MIN_N, meanScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
}

function readingMetrics(records: ReadingRecord[]): SessionContext["reading"] {
  const withText = records.filter((r) => r.words > 0);
  const skimmed = withText.filter(isSkimmed);
  const read = withText.filter((r) => !isSkimmed(r));
  const scoreOf = (list: ReadingRecord[]) => list.flatMap((r) => (r.firstQuizScore === null ? [] : [r.firstQuizScore]));
  const arms = { skimmed: scoreArm(scoreOf(skimmed)), read: scoreArm(scoreOf(read)) };
  return {
    lessons: records.length,
    skimmed: share(skimmed.length, withText.length),
    medianWordsPerMinute: median(withText.flatMap((r) => wordsPerMinute(r) ?? [])),
    reopened: share(records.filter((r) => r.opens > 1).length, records.length),
    firstQuizScore: { ...arms, difference: arms.skimmed.meanScore !== null && arms.read.meanScore !== null ? arms.read.meanScore - arms.skimmed.meanScore : null },
  };
}

function persistenceMetrics(sessions: SessionRatings[]): SessionContext["persistence"] {
  const outcomes = sessions.flatMap((s) => afterFailureStreak(s) ?? []);
  const count = (kind: string) => outcomes.filter((o) => o === kind).length;
  return {
    sessionsWithStreak: outcomes.length,
    continued: share(count("continued"), outcomes.length),
    exited: share(count("exited"), outcomes.length),
    ended: share(count("ended"), outcomes.length),
  };
}

function deviceArm(list: DeviceSession[]): DeviceArm {
  const answered = list.reduce((s, d) => s + d.answered, 0);
  const correct = list.reduce((s, d) => s + d.correct, 0);
  return { sessions: list.length, small: list.length < MIN_N, answered, correct, accuracy: answered > 0 ? correct / answered : null };
}

export function computeSessionContext(people: SessionContextUser[]): SessionContext {
  const sessions = people.flatMap((p) => p.deviceSessions);
  return {
    reading: readingMetrics(people.flatMap((p) => p.reading)),
    persistence: persistenceMetrics(people.flatMap((p) => p.sessions)),
    device: {
      narrow: deviceArm(sessions.filter((s) => s.deviceClass === "narrow")),
      wide: deviceArm(sessions.filter((s) => s.deviceClass === "wide")),
      unknown: sessions.filter((s) => s.deviceClass === null).length,
    },
  };
}

/** Die Werte gesamt und je Evaluationsgruppe. */
export function computeSessionContextByGroup(people: SessionContextUser[]) {
  const groups = [...new Set(people.map((p) => p.group))].sort();
  return {
    all: computeSessionContext(people),
    byGroup: Object.fromEntries(groups.map((g) => [g, computeSessionContext(people.filter((p) => p.group === g))])) as Partial<Record<EvaluationGroup, SessionContext>>,
  };
}
