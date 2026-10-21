/**
 * PSRP-HR Phase 4: Human State Engine - reine Berechnung von Φ (Belastung 0..1) aus Check-in,
 * Chronotyp und Arbeitstag. Φ wirkt ausschließlich auf die Planungsschicht (Architektur-Regel 2).
 */
import { DEFAULT_PSRP_CONFIG, type PsrpConfig } from "./config";

export const clip = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export interface CheckinValues {
  /** 1 (erschöpft) … 5 (voller Energie) */
  energyLevel: number;
  timeBudgetMin: number;
  hadWorkday: boolean;
}

/** Neutrale Werte, wenn ein Check-in übersprungen wird und es keine früheren Werte gibt. */
export const NEUTRAL_CHECKIN: Omit<CheckinValues, "timeBudgetMin"> = { energyLevel: 3, hadWorkday: false };

/** Übersprungener Check-in: letzte Werte, sonst neutrale Standardwerte; das Zeitbudget kommt immer aus der Eingabe. */
export function imputeCheckin(
  partial: Partial<Pick<CheckinValues, "energyLevel" | "hadWorkday">>,
  timeBudgetMin: number,
  last: Pick<CheckinValues, "energyLevel" | "hadWorkday"> | null,
): { values: CheckinValues; imputed: boolean } {
  const energyKnown = partial.energyLevel !== undefined;
  const workKnown = partial.hadWorkday !== undefined;
  return {
    imputed: !energyKnown || !workKnown,
    values: {
      timeBudgetMin,
      energyLevel: partial.energyLevel ?? last?.energyLevel ?? NEUTRAL_CHECKIN.energyLevel,
      hadWorkday: partial.hadWorkday ?? last?.hadWorkday ?? NEUTRAL_CHECKIN.hadWorkday,
    },
  };
}

/** Zeitbudget ≤ 10 min → 1.0, ≤ 20 min → 0.5, sonst 0. */
export function timeStress(timeBudgetMin: number): number {
  if (timeBudgetMin <= 10) return 1;
  if (timeBudgetMin <= 20) return 0.5;
  return 0;
}

export interface ChronoReview {
  localHour: number;
  success: boolean;
  /** Ausreißer-Antwortzeiten ändern nichts am Erfolg; das Feld ist nur für Aufrufer da. */
}

export interface ChronoBlockStats {
  block: number;
  n: number;
  rate: number;
}

export function chronoBlockOf(hour: number, blockHours: number): number {
  return Math.floor(hour / blockHours);
}

/** Erfolgsquote je Tageszeit-Block (z. B. 4-Stunden-Blöcke). */
export function chronoProfile(
  reviews: ChronoReview[],
  config: PsrpConfig["state"] = DEFAULT_PSRP_CONFIG.state,
): Map<number, ChronoBlockStats> {
  const acc = new Map<number, { n: number; ok: number }>();
  for (const review of reviews) {
    const block = chronoBlockOf(review.localHour, config.chronoBlockHours);
    const entry = acc.get(block) ?? { n: 0, ok: 0 };
    entry.n++;
    if (review.success) entry.ok++;
    acc.set(block, entry);
  }
  return new Map([...acc].map(([block, { n, ok }]) => [block, { block, n, rate: ok / n }]));
}

function isNight(hour: number, config: PsrpConfig["state"]): boolean {
  return config.chronoNightFrom > config.chronoNightTo
    ? hour >= config.chronoNightFrom || hour < config.chronoNightTo
    : hour >= config.chronoNightFrom && hour < config.chronoNightTo;
}

/**
 * C_chrono: normierte Abweichung des aktuellen Blocks unter dem persönlichen Bestwert.
 * Hat der aktuelle Block weniger als `chronoMinReviewsPerBlock` Reviews (oder es gibt keinen
 * belastbaren Bestwert), gilt der Rückfall: 22-05 Uhr → 0.5, sonst 0.
 */
export function chronoStress(
  profile: Map<number, ChronoBlockStats>,
  currentHour: number,
  config: PsrpConfig["state"] = DEFAULT_PSRP_CONFIG.state,
): number {
  const current = profile.get(chronoBlockOf(currentHour, config.chronoBlockHours));
  const reliable = [...profile.values()].filter((b) => b.n >= config.chronoMinReviewsPerBlock);
  if (!current || current.n < config.chronoMinReviewsPerBlock || reliable.length === 0) {
    return isNight(currentHour, config) ? config.chronoNightValue : 0;
  }
  const best = Math.max(...reliable.map((b) => b.rate));
  if (best <= 0) return 0;
  return clip((best - current.rate) / best);
}

/** Φ = clip(w_E·(5−E)/4 + w_T·T_stress + w_C·C_chrono + w_W·W_arbeit, 0, 1). */
export function computePhi(
  checkin: CheckinValues,
  chrono: number,
  config: PsrpConfig["state"] = DEFAULT_PSRP_CONFIG.state,
): number {
  const energyTerm = (5 - clip(checkin.energyLevel, 1, 5)) / 4;
  return clip(
    config.wEnergy * energyTerm +
      config.wTime * timeStress(checkin.timeBudgetMin) +
      config.wChrono * chrono +
      config.wWork * (checkin.hadWorkday ? 1 : 0),
  );
}

/** r_target = r_max − (r_max − r_min)·Φ */
export function targetRetention(phi: number, fsrs: PsrpConfig["fsrs"] = DEFAULT_PSRP_CONFIG.fsrs): number {
  return fsrs.rMax - (fsrs.rMax - fsrs.rMin) * clip(phi);
}

/** Faktor für das Tageslimit: 1 − 0.3·Φ */
export function limitFactor(phi: number, config: PsrpConfig["state"] = DEFAULT_PSRP_CONFIG.state): number {
  return 1 - config.limitReduction * clip(phi);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Antwortzeiten > 3 × persönlicher Median werden für Statistiken ignoriert (der Rohlog bleibt unverändert). */
export function withoutOutliers(
  times: number[],
  config: PsrpConfig["state"] = DEFAULT_PSRP_CONFIG.state,
): number[] {
  const med = median(times);
  if (med === null) return [];
  return times.filter((t) => t <= med * config.outlierFactor);
}

/** Identische Check-in-Werte über mindestens `monotoneSessions` aufeinanderfolgende Sessions. */
export function isMonotoneCheckins(
  recent: Array<Pick<CheckinValues, "energyLevel" | "timeBudgetMin" | "hadWorkday">>,
  config: PsrpConfig["state"] = DEFAULT_PSRP_CONFIG.state,
): boolean {
  if (recent.length < config.monotoneSessions) return false;
  const window = recent.slice(0, config.monotoneSessions);
  const first = window[0];
  return window.every(
    (c) => c.energyLevel === first.energyLevel && c.timeBudgetMin === first.timeBudgetMin && c.hadWorkday === first.hadWorkday,
  );
}

/** Bei hohem Φ kommen Items mit hoher Difficulty nach hinten (stabile Sortierung, sonst unverändert). */
export function sortHardLast<T extends { difficulty: number }>(
  items: T[],
  phi: number,
  config: PsrpConfig["state"] = DEFAULT_PSRP_CONFIG.state,
): T[] {
  if (phi < config.hardLastPhi) return items;
  const hardCut = median(items.map((i) => i.difficulty));
  if (hardCut === null) return items;
  const easy = items.filter((i) => i.difficulty <= hardCut);
  const hard = items.filter((i) => i.difficulty > hardCut);
  return [...easy, ...hard];
}
