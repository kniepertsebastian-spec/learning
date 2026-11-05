/**
 * PSRP-HR (docs/roadmaps/roadmap_psrp_hr.md): alle Gewichte und Schwellen an einer Stelle (Architektur-Regel 4).
 * Jeder Wert ist ein Standardwert; Funktionen nehmen eine (teilweise) abweichende Konfiguration entgegen.
 */
import type { AgeRange } from "@/lib/server/db/schema";

export interface PsrpConfig {
  fsrs: {
    /** Korridor der Ziel-Retention (r_min .. r_max). */
    rMin: number;
    rMax: number;
    /** Mindestanzahl Reviews für den persönlichen Parameter-Fit. */
    minReviewsForFit: number;
    /** Abstand zwischen zwei Fits in Tagen. */
    refitIntervalDays: number;
    /** Kaltstart-Parameter je Altersspanne (initial überall Standardparameter = null). */
    ageRangeWeights: Partial<Record<AgeRange, number[] | null>>;
  };
  planning: {
    /** Rückfall für die Sekunden je Review. */
    fallbackSecondsPerReview: number;
    /** Zeit für Feedback und Erklärung je Frage, die die gemessene Antwortzeit nicht enthält. */
    feedbackSecondsPerReview: number;
    /** Zusatzgewicht prüfungsrelevanter Items bei aktivem Prüfungsdatum. */
    examRelevanceWeight: number;
    /** Load Balancing: Streuung in Prozent des Intervalls; ab `loadBalanceWideFromDays` mindestens ±1 Tag. */
    loadBalanceFraction: number;
    loadBalanceWideFromDays: number;
    /** Faktor des Kontingents an leichten Tagen. */
    lightDayFactor: number;
    /** Prüfungsmodus: Anzahl Tage vor dem Prüfungsdatum, in denen r_ziel linear steigt. */
    examRampDays: number;
    /** Rückstau: Schwelle (in Vielfachen des Tageslimits), unter der wieder neue Karten kommen. */
    backlogResumeNewFactor: number;
    /** Erlaubt dem Nutzer, das Tageslimit zu überschreiben („Mehr lernen“). */
    allowLimitOverride: boolean;
    /** Anzahl Karten, um die „Mehr lernen“ das Limit je Klick erhöht (Anteil des Limits). */
    moreStudyIncrement: number;
  };
  state: {
    /** Φ-Gewichte. */
    wEnergy: number;
    wTime: number;
    wChrono: number;
    wWork: number;
    /** Tageslimit-Faktor = 1 − limitReduction · Φ. */
    limitReduction: number;
    /** Φ-Schwelle, ab der schwere Karten nach hinten sortiert werden. */
    hardLastPhi: number;
    chronoBlockHours: number;
    chronoMinReviewsPerBlock: number;
    /** Fallback bei zu wenig Daten: Nachtstunden [von, bis) → Wert. */
    chronoNightFrom: number;
    chronoNightTo: number;
    chronoNightValue: number;
    /** Ausreißer: Antwortzeit > factor · persönlicher Median wird in Statistiken ignoriert. */
    outlierFactor: number;
    /** Monotone Check-ins: identische Werte über mindestens so viele Sessions. */
    monotoneSessions: number;
  };
  evaluation: {
    abandonAfterDays: number;
  };
  probes: {
    /** Anteil versteckter Abfragen pro Lektion (Obergrenze). */
    maxShare: number;
    minPredictedR: number;
    maxPredictedR: number;
    /** Dieselbe Variante frühestens nach so vielen Tagen erneut. */
    variantCooldownDays: number;
    /** Keine Abfrage innerhalb dieser Stunden nach einem regulären Review desselben Konzepts. */
    conceptCooldownHours: number;
    /** Mindestanzahl Abfragen für einen belastbaren Kalibrierungswert. */
    minProbesForCalibration: number;
    /** Gewicht des Selbst-Ratings im erwarteten Erfolg (Rest: Populations-Erfolgsquote). */
    selfRatingWeight: number;
    /** Abbildung Selbst-Rating (1-4) auf erwarteten Erfolg. */
    selfRatingExpected: Record<1 | 2 | 3 | 4, number>;
    /** Stärke der Schrumpfung (Pseudo-Beobachtungen am Populationsmittel). */
    shrinkagePriorN: number;
    /** Populationsmittel des Bias (Prior). */
    populationBias: number;
    /** z-Wert des Konfidenzintervalls. */
    ciZ: number;
    /** Wie stark Überschätzung die Priorität eines Themengebiets erhöht. */
    overestimateBoost: number;
    /** Bias-Grenzen für die Nutzeransicht. */
    biasOverThreshold: number;
    biasUnderThreshold: number;
  };
  /** Rating-Mapping für implizite Reviews. */
  implicit: { solved: 1 | 2 | 3 | 4; failed: 1 | 2 | 3 | 4 };
}

export const DEFAULT_PSRP_CONFIG: PsrpConfig = {
  fsrs: { rMin: 0.75, rMax: 0.9, minReviewsForFit: 400, refitIntervalDays: 7, ageRangeWeights: {} },
  planning: {
    // Eine Session-Frage ist eine volle Frage mit Sofort-Feedback, keine Karteikarte: ohne eigene Messwerte rechnen wir mit
    // 45 Sekunden je Frage (10 Minuten ≈ 13 Fragen): Auswahlfragen 30-45 s, Freitext/Formatfragen 60-90 s bei höchstens 20 % Formatfragen.
    fallbackSecondsPerReview: 45,
    feedbackSecondsPerReview: 20,
    examRelevanceWeight: 0.15,
    loadBalanceFraction: 0.05,
    loadBalanceWideFromDays: 7,
    lightDayFactor: 0.5,
    examRampDays: 21,
    backlogResumeNewFactor: 1,
    allowLimitOverride: true,
    moreStudyIncrement: 0.5,
  },
  state: {
    wEnergy: 0.35,
    wTime: 0.25,
    wChrono: 0.25,
    wWork: 0.15,
    limitReduction: 0.3,
    hardLastPhi: 0.6,
    chronoBlockHours: 4,
    chronoMinReviewsPerBlock: 50,
    chronoNightFrom: 22,
    chronoNightTo: 5,
    chronoNightValue: 0.5,
    outlierFactor: 3,
    monotoneSessions: 10,
  },
  evaluation: { abandonAfterDays: 14 },
  probes: {
    maxShare: 0.1,
    minPredictedR: 0.8,
    maxPredictedR: 0.9,
    variantCooldownDays: 30,
    conceptCooldownHours: 24,
    minProbesForCalibration: 30,
    selfRatingWeight: 0.5,
    selfRatingExpected: { 1: 0.2, 2: 0.6, 3: 0.85, 4: 0.95 },
    shrinkagePriorN: 30,
    populationBias: 0,
    ciZ: 1.96,
    overestimateBoost: 0.5,
    biasOverThreshold: 0.1,
    biasUnderThreshold: -0.1,
  },
  implicit: { solved: 3, failed: 1 },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Überlagert eine teilweise Konfiguration über die Standardwerte (flach je Abschnitt). */
export function resolveConfig(override: DeepPartial<PsrpConfig> = {}): PsrpConfig {
  const base = DEFAULT_PSRP_CONFIG;
  return {
    fsrs: { ...base.fsrs, ...override.fsrs },
    planning: { ...base.planning, ...override.planning },
    state: { ...base.state, ...override.state },
    evaluation: { ...base.evaluation, ...override.evaluation },
    probes: {
      ...base.probes,
      ...override.probes,
      selfRatingExpected: { ...base.probes.selfRatingExpected, ...override.probes?.selfRatingExpected },
    },
    implicit: { ...base.implicit, ...override.implicit },
  } as PsrpConfig;
}
