/**
 * PSRP-HR Phase 3: Planungsschicht - reine Funktionen. Entscheidet, welche fälligen Karten heute
 * gezeigt werden und mit welcher Ziel-Retention neue Intervalle geplant werden. Das Gedächtnismodell
 * (FSRS) bleibt unberührt.
 */
import { DEFAULT_PSRP_CONFIG, type PsrpConfig } from "./config";
import { limitFactor, sortHardLast } from "./state";

const DAY_MS = 86_400_000;

export interface DueCandidate {
  itemId: string;
  /** Aktuelle Abrufwahrscheinlichkeit (0..1). */
  retrievability: number;
  difficulty: number;
  /** 0..1: Prüfungsrelevanz (z. B. Domain-Gewicht); zählt nur bei aktivem Prüfungsdatum. */
  examRelevance?: number;
  due: Date;
}

/** Tageslimit = floor(Budget·60 / Ø-Sekunden je Review), skaliert mit Φ-Faktor und leichtem Tag; mindestens 1. */
export function dailyLimit(params: {
  timeBudgetMin: number;
  avgSecondsPerReview?: number | null;
  phi?: number;
  lightDay?: boolean;
  /** „Mehr lernen“: Aufschlag auf das Limit in Karten. */
  extra?: number;
  config?: PsrpConfig;
}): number {
  const config = params.config ?? DEFAULT_PSRP_CONFIG;
  const avg = params.avgSecondsPerReview && params.avgSecondsPerReview > 0
    ? params.avgSecondsPerReview
    : config.planning.fallbackSecondsPerReview;
  const base = Math.floor((params.timeBudgetMin * 60) / avg);
  const scaled = base * limitFactor(params.phi ?? 0, config.state) * (params.lightDay ? config.planning.lightDayFactor : 1);
  return Math.max(1, Math.floor(scaled)) + Math.max(0, params.extra ?? 0);
}

/** „Mehr lernen“: Erhöhung des Limits um einen konfigurierbaren Anteil (mindestens 1 Karte). */
export function moreStudyExtra(limit: number, config: PsrpConfig = DEFAULT_PSRP_CONFIG): number {
  return config.planning.allowLimitOverride ? Math.max(1, Math.ceil(limit * config.planning.moreStudyIncrement)) : 0;
}

/** Niedrigste Retrievability zuerst; bei aktivem Prüfungsdatum zählt Prüfungsrelevanz als Vorsprung. */
export function prioritize(
  candidates: DueCandidate[],
  examActive: boolean,
  config: PsrpConfig = DEFAULT_PSRP_CONFIG,
): DueCandidate[] {
  const score = (c: DueCandidate) =>
    c.retrievability - (examActive ? config.planning.examRelevanceWeight * (c.examRelevance ?? 0) : 0);
  return [...candidates].sort((a, b) => score(a) - score(b) || a.due.getTime() - b.due.getTime());
}

export interface DailyQueueResult {
  queue: DueCandidate[];
  /** Fällige, aber heute nicht gezeigte Karten (bleiben fällig). */
  deferred: number;
  /** Neue Karten sind pausiert, solange der Rückstand über der Schwelle liegt. */
  newCardsPaused: boolean;
}

/**
 * Wählt die Karten des Tages. Nicht gezeigte Karten behalten ihr `due` (kein künstliches Neusetzen);
 * ein Rückstand über dem Tageslimit verteilt sich so über mehrere Tage, neue Karten pausieren,
 * bis der Rückstand unter `backlogResumeNewFactor × Limit` liegt.
 */
export function selectDailyQueue(params: {
  due: DueCandidate[];
  limit: number;
  phi?: number;
  examActive?: boolean;
  config?: PsrpConfig;
}): DailyQueueResult {
  const config = params.config ?? DEFAULT_PSRP_CONFIG;
  const ordered = prioritize(params.due, params.examActive ?? false, config);
  const chosen = ordered.slice(0, params.limit);
  const queue = sortHardLast(chosen, params.phi ?? 0, config.state);
  const deferred = ordered.length - chosen.length;
  return {
    queue,
    deferred,
    newCardsPaused: ordered.length > params.limit * config.planning.backlogResumeNewFactor,
  };
}

/** Anzahl Tage bis zum Prüfungsdatum (ganze Tage, ≥ 0), null ohne Datum oder wenn es vorbei ist. */
export function daysUntilExam(examDate: Date | null | undefined, now: Date): number | null {
  if (!examDate) return null;
  const diff = Math.ceil((examDate.getTime() - now.getTime()) / DAY_MS);
  return diff >= 0 ? diff : null;
}

/** Prüfungsmodus: r_ziel steigt in den letzten N Tagen linear von `rBase` bis zur Obergrenze. */
export function examAdjustedTarget(
  rBase: number,
  daysToExam: number | null,
  config: PsrpConfig = DEFAULT_PSRP_CONFIG,
): number {
  const { rMax } = config.fsrs;
  const n = config.planning.examRampDays;
  if (daysToExam === null || daysToExam >= n) return rBase;
  const progress = 1 - Math.max(0, daysToExam) / n;
  return rBase + (rMax - rBase) * progress;
}

/** Intervalle gehen nicht über das Prüfungsdatum hinaus, solange es in der Zukunft liegt (mindestens 1 Tag). */
export function clampIntervalToExam(intervalDays: number, daysToExam: number | null): number {
  if (daysToExam === null) return intervalDays;
  return Math.max(1, Math.min(intervalDays, daysToExam));
}

/** Zulässige Streuung des Intervalls: ±5 %, mindestens ±1 Tag ab Intervall ≥ 7. */
export function loadBalanceSpread(intervalDays: number, config: PsrpConfig = DEFAULT_PSRP_CONFIG): number {
  const spread = Math.floor(intervalDays * config.planning.loadBalanceFraction);
  return intervalDays >= config.planning.loadBalanceWideFromDays ? Math.max(1, spread) : 0;
}

export function dayKey(date: Date, timeZone = "UTC"): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Load Balancing: wählt innerhalb der zulässigen Streuung den Tag mit der geringsten bereits
 * geplanten Last; leichte Tage werden gemieden, solange ein anderer Tag möglich ist.
 * Bei Gleichstand gewinnt der Tag, der dem berechneten Intervall am nächsten liegt.
 */
export function balanceInterval(params: {
  from: Date;
  intervalDays: number;
  /** Bereits geplante Karten je Tag (Schlüssel = dayKey in der Zeitzone des Nutzers). */
  loadByDay: ReadonlyMap<string, number>;
  /** ISO-Wochentage (1-7) mit reduziertem Kontingent. */
  lightWeekdays?: readonly number[];
  weekdayOf: (date: Date) => number;
  daysToExam?: number | null;
  timeZone?: string;
  config?: PsrpConfig;
}): number {
  const config = params.config ?? DEFAULT_PSRP_CONFIG;
  const spread = loadBalanceSpread(params.intervalDays, config);
  if (spread === 0) return params.intervalDays;
  const light = new Set(params.lightWeekdays ?? []);
  const maxByExam = params.daysToExam ?? Infinity;

  let best = params.intervalDays;
  let bestScore: [number, number, number] | null = null;
  for (let offset = -spread; offset <= spread; offset++) {
    const interval = params.intervalDays + offset;
    if (interval < 1 || interval > maxByExam) continue;
    const day = new Date(params.from.getTime() + interval * DAY_MS);
    const isLight = light.has(params.weekdayOf(day)) ? 1 : 0;
    const load = params.loadByDay.get(dayKey(day, params.timeZone)) ?? 0;
    const score: [number, number, number] = [isLight, load, Math.abs(offset)];
    if (!bestScore || score[0] < bestScore[0] || (score[0] === bestScore[0] && (score[1] < bestScore[1] || (score[1] === bestScore[1] && score[2] < bestScore[2])))) {
      bestScore = score;
      best = interval;
    }
  }
  return best;
}
