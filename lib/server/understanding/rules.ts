/**
 * Verstehens-Modus (roadmap_didaktik Phase 9.1): reine Regeln. Unterscheidet Vergessen (hilft: Wiederholen) von Nicht-Verstehen
 * (hilft: anders angehen). Ausgelöst wird nur bei einem Muster, nie bei einem Einzelfehler.
 */
import type { StruggleSignal, StruggleSignalKind } from "@/lib/server/db/schema";

export interface UnderstandingConfig {
  /** Signale zählen höchstens so viele Tage zurück. */
  windowDays: number;
  /** Auslösung: mindestens so viele verschiedene Signalarten ... */
  minDistinctKinds: number;
  /** ... oder so oft „falsch + sicher“. */
  minSureWrong: number;
  /** Dieselbe falsche Option mindestens so oft bei derselben Frage. */
  repeatedWrongOptionMin: number;
  /** Fehler bei mindestens so vielen verschiedenen Fragen (Original und Varianten) desselben Konzepts. */
  distinctVariantFailuresMin: number;
  /** Item ohne Fortschritt: mindestens so viele Fehlschläge (Rating 1) und Stabilität unter ... Tagen. */
  stalledFailures: number;
  stalledStabilityDays: number;
  /** Simulation nur mit mindestens so vielen Hilfen gelöst. */
  simulationHelps: number;
}

export const DEFAULT_UNDERSTANDING_CONFIG: UnderstandingConfig = {
  windowDays: 14,
  minDistinctKinds: 2,
  minSureWrong: 2,
  repeatedWrongOptionMin: 2,
  distinctVariantFailuresMin: 2,
  stalledFailures: 3,
  stalledStabilityDays: 2,
  simulationHelps: 2,
};

const DAY_MS = 86_400_000;

export interface RawSignal {
  kind: StruggleSignalKind;
  at: Date;
  questionId?: string;
  optionId?: string;
}

export interface StruggleEvaluation {
  triggered: boolean;
  /** Die gezählten Signale (im Fenster, nach `since`), neueste zuletzt. */
  signals: StruggleSignal[];
}

/**
 * Wertet die Signale eines Konzepts aus. `since`: nach einer Lösung oder Ablehnung zählen nur noch neuere Signale, damit
 * Altlasten nicht sofort wieder auslösen.
 */
export function evaluateStruggle(signals: RawSignal[], now: Date, config: UnderstandingConfig = DEFAULT_UNDERSTANDING_CONFIG, since: Date | null = null): StruggleEvaluation {
  const from = now.getTime() - config.windowDays * DAY_MS;
  const counted = signals
    .filter((s) => s.at.getTime() >= from && s.at.getTime() <= now.getTime() && (since === null || s.at.getTime() > since.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const kinds = new Set(counted.map((s) => s.kind));
  const sureWrong = counted.filter((s) => s.kind === "sure_wrong").length;
  return {
    triggered: kinds.size >= config.minDistinctKinds || sureWrong >= config.minSureWrong,
    signals: counted.map((s) => ({ kind: s.kind, at: s.at.toISOString(), ...(s.questionId ? { questionId: s.questionId } : {}), ...(s.optionId ? { optionId: s.optionId } : {}) })),
  };
}

/** Falsche Antworten, bei denen dieselbe Option derselben (gezeigten) Frage mindestens `min`-mal gewählt wurde. */
export function repeatedWrongOptionSignals(wrong: Array<{ questionId: string; optionId: string; at: Date }>, min: number): RawSignal[] {
  const groups = new Map<string, Array<{ questionId: string; optionId: string; at: Date }>>();
  for (const w of wrong) groups.set(`${w.questionId}:${w.optionId}`, [...(groups.get(`${w.questionId}:${w.optionId}`) ?? []), w]);
  return [...groups.values()]
    .filter((g) => g.length >= min)
    .map((g) => {
      const last = g.reduce((a, b) => (b.at > a.at ? b : a));
      return { kind: "repeated_wrong_option" as const, at: last.at, questionId: last.questionId, optionId: last.optionId };
    });
}

/** Fehler bei mindestens `min` verschiedenen Fragen (Original und Varianten) des Konzepts: ein Signal zum Zeitpunkt des letzten Fehlers. */
export function distinctVariantFailureSignal(failures: Array<{ questionId: string; at: Date }>, min: number): RawSignal | null {
  if (new Set(failures.map((f) => f.questionId)).size < min) return null;
  return { kind: "distinct_variant_failures", at: failures.reduce((a, b) => (b.at > a.at ? b : a)).at };
}
