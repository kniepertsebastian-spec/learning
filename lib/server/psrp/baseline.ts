/**
 * Ausgangswerte und Vergleich (roadmap_motivation Phase 10): reine Funktionen ohne Datenbank.
 * Eine Momentaufnahme hält die Kennzahlen des anonymisierten Metrik-Exports zu einem Zeitpunkt fest (VOR dem Einschalten einer Mechanik
 * bzw. vor dem Start einer Kontrollgruppe); der Vergleich zeigt später, was sich verändert hat. Beschreibend, keine Signifikanztests:
 * die Nutzerzahlen sind anfangs klein.
 */
import { FEATURE_FLAGS, type FeatureFlag } from "@/lib/server/feature-flags";
import type { EngagementMetrics } from "./engagement-metrics";

export interface FigureValue {
  value: number | null;
  /** Nenner (Personen, Kurse, Reviews …), damit man kleine Stichproben erkennt. */
  n: number | null;
}
export type Figures = Record<string, FigureValue>;

/** Eingestellter Anteil je Flag aus der Umgebung (100 = alle, 0 = aus), damit eine Momentaufnahme festhält, wer welche Mechanik hatte. */
export function flagConfig(env: Record<string, string | undefined> = process.env): Record<FeatureFlag, number> {
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => {
      const key = `FEATURE_${flag.toUpperCase()}`;
      if (env[key] === "0") return [flag, 0];
      const raw = env[`${key}_ROLLOUT`];
      const percent = raw === undefined || raw === "" || !Number.isFinite(Number(raw)) ? 100 : Math.min(100, Math.max(0, Number(raw)));
      return [flag, percent];
    }),
  ) as Record<FeatureFlag, number>;
}

type EngagementLike = Pick<EngagementMetrics, "users" | "churn7" | "churn30" | "returnAfterPause" | "courseCompletion" | "exit" | "deescalation">;

function engagementFigures(prefix: string, m: EngagementLike): Figures {
  return {
    [`${prefix}.users`]: { value: m.users, n: null },
    [`${prefix}.churn7`]: { value: m.churn7.rate, n: m.churn7.denominator },
    [`${prefix}.churn30`]: { value: m.churn30.rate, n: m.churn30.denominator },
    [`${prefix}.returnAfterPause`]: { value: m.returnAfterPause.rate, n: m.returnAfterPause.closed + m.returnAfterPause.open },
    [`${prefix}.courseCompletion`]: { value: m.courseCompletion.rate, n: m.courseCompletion.denominator },
    [`${prefix}.exitShare`]: { value: m.exit.rate, n: m.exit.denominator },
    [`${prefix}.deescalationShare`]: { value: m.deescalation.rate, n: m.deescalation.denominator },
  };
}

interface Arm {
  users: number;
  reviews: number;
  retention: number | null;
}
type ArmPair = { enabled: Arm; disabled: Arm };

/** Die Abschnitte des Exports, die je Flag zwei Gruppen (mit/ohne) liefern. */
export interface BaselineSource {
  asOf: string;
  engagement: { all: EngagementLike; byFlag: Record<string, { enabled: EngagementLike; disabled: EngagementLike }> };
  /** Behaltensquote je Flag (Behalten = Rating über „nochmal“). */
  retentionByFlag: Partial<Record<FeatureFlag | "variant_rotation" | "think_first", ArmPair>>;
}

/** Alle Kennzahlen als flache Liste, stabile Schlüssel („engagement.all.churn7“, „flag.exit_with_win.enabled.churn7“, „retention.recall_check.disabled“). */
export function keyFigures(source: BaselineSource): Figures {
  const figures: Figures = engagementFigures("engagement.all", source.engagement.all);
  for (const [flag, arms] of Object.entries(source.engagement.byFlag)) {
    Object.assign(figures, engagementFigures(`flag.${flag}.enabled`, arms.enabled), engagementFigures(`flag.${flag}.disabled`, arms.disabled));
  }
  for (const [flag, arms] of Object.entries(source.retentionByFlag)) {
    if (!arms) continue;
    figures[`retention.${flag}.enabled`] = { value: arms.enabled.retention, n: arms.enabled.reviews };
    figures[`retention.${flag}.disabled`] = { value: arms.disabled.retention, n: arms.disabled.reviews };
  }
  return figures;
}

export interface Comparison {
  key: string;
  before: FigureValue | null;
  after: FigureValue | null;
  /** Veränderung in Prozentpunkten bei Anteilen (0–1) bzw. absolut bei Zahlen; null, wenn eine Seite fehlt. */
  delta: number | null;
  /** Eine Seite hat weniger als `minN` Personen/Reviews im Nenner: nur ansehen, nicht deuten. */
  small: boolean;
}

export const MIN_N = 20;

/** Vorher/Nachher je Kennzahl, nach Schlüssel sortiert. Fehlt eine Kennzahl auf einer Seite, steht dort null. */
export function compareFigures(before: Figures, after: Figures, minN = MIN_N): Comparison[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.map((key) => {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    const delta = a?.value != null && b?.value != null ? b.value - a.value : null;
    const small = [a, b].some((f) => f != null && f.n != null && f.n < minN);
    return { key, before: a, after: b, delta, small };
  });
}

/** Für die Ausgabe: Anteile in Prozent, Zahlen unverändert. */
export function formatFigure(key: string, f: FigureValue | null): string {
  if (!f || f.value === null) return "–";
  const isCount = key.endsWith(".users");
  const text = isCount ? String(f.value) : key.endsWith("perHundredSessions") ? f.value.toFixed(1) : `${(f.value * 100).toFixed(1)} %`;
  return f.n != null ? `${text} (n=${f.n})` : text;
}
