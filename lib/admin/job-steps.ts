/** Die fünf Schritte der Kursgenerierung für die Fortschrittsleiste (UI U7); Zuordnung aus dem Auftragsstatus. */
export const JOB_STEPS = ["preflight", "blueprint", "canary", "objectives", "finish"] as const;
export type JobStep = (typeof JOB_STEPS)[number];

const STEP_BY_STATUS: Record<string, number> = {
  queued: 0,
  preflight: 0,
  blueprint_requested: 1,
  blueprint_generating: 1,
  blueprint_validating: 1,
  cost_estimating: 1,
  blueprint_ready: 1,
  canary_generating: 2,
  canary_validating: 2,
  content_generating: 3,
  batch_generating: 3,
  repairing: 3,
  circuit_breaker_open: 3,
  validating: 4,
  importing: 4,
  package_ready: 4,
};

/** Index 0..4 des laufenden Schritts; unbekannte Status zählen als Schritt 1. */
export function jobStepIndex(status: string): number {
  return STEP_BY_STATUS[status] ?? 0;
}

/** Füllung der fünf Segmente in Prozent; der laufende Schritt anteilig (`fraction` 0..1, bei Lernzielen = fertig/gesamt). */
export function jobStepFill(status: string, fraction = 0.5): number[] {
  const current = jobStepIndex(status);
  const f = Math.max(0, Math.min(1, fraction));
  return JOB_STEPS.map((_, i) => (i < current ? 100 : i === current ? Math.round(f * 100) : 0));
}
