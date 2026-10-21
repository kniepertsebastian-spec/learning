/**
 * PSRP-HR Phase 5: Φ-Gewichte aus Logs schätzen. Logistische Regression auf den Abruferfolg, mit der
 * FSRS-Vorhersage als Offset (gemessen wird nur, was FSRS nicht schon erklärt). Ausgabe ist ein
 * Vorschlag; nichts wird automatisch übernommen.
 */
import { DEFAULT_PSRP_CONFIG } from "./config";

export interface WeightSample {
  /** (5−E)/4, T_stress, C_chrono, W_arbeit */
  features: [number, number, number, number];
  predictedR: number;
  success: boolean;
}

export interface WeightProposal {
  samples: number;
  /** Rohe Koeffizienten (negativ = senkt den Erfolg, passt zur Belastung). */
  coefficients: [number, number, number, number];
  /** Auf Summe 1 normierte Gewichte (nur Belastungsrichtung), Vorschlag für w_E, w_T, w_C, w_W. */
  proposed: { wEnergy: number; wTime: number; wChrono: number; wWork: number };
  current: { wEnergy: number; wTime: number; wChrono: number; wWork: number };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(Math.min(1 - 1e-4, Math.max(1e-4, p)) / (1 - Math.min(1 - 1e-4, Math.max(1e-4, p))));

export function estimateWeights(samples: WeightSample[], iterations = 400, learningRate = 0.5, l2 = 0.01): WeightProposal {
  const current = {
    wEnergy: DEFAULT_PSRP_CONFIG.state.wEnergy,
    wTime: DEFAULT_PSRP_CONFIG.state.wTime,
    wChrono: DEFAULT_PSRP_CONFIG.state.wChrono,
    wWork: DEFAULT_PSRP_CONFIG.state.wWork,
  };
  const beta: [number, number, number, number] = [0, 0, 0, 0];
  const n = samples.length;
  if (n > 0) {
    for (let it = 0; it < iterations; it++) {
      const grad = [0, 0, 0, 0];
      for (const s of samples) {
        const z = logit(s.predictedR) + beta.reduce((acc, b, i) => acc + b * s.features[i], 0);
        const err = (s.success ? 1 : 0) - sigmoid(z);
        for (let i = 0; i < 4; i++) grad[i] += err * s.features[i];
      }
      for (let i = 0; i < 4; i++) beta[i] += (learningRate * (grad[i] / n - l2 * beta[i]));
    }
  }
  // Belastung senkt den Erfolg → Gewicht = Betrag der negativen Koeffizienten, auf Summe 1 normiert.
  const burden = beta.map((b) => Math.max(0, -b));
  const total = burden.reduce((a, b) => a + b, 0);
  const norm = total > 0 ? burden.map((b) => b / total) : [current.wEnergy, current.wTime, current.wChrono, current.wWork];
  return {
    samples: n,
    coefficients: beta,
    proposed: { wEnergy: norm[0], wTime: norm[1], wChrono: norm[2], wWork: norm[3] },
    current,
  };
}
