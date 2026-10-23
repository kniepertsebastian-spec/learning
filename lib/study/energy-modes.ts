/** Aufgabenart nach Energie (roadmap_motivation Phase 4): bei wenig Energie anders lernen, als Angebot und nie als Zwang. */
import type { EnergyMode } from "@/lib/server/db/schema";

export type EnergyAlternative = Exclude<EnergyMode, "normal">;

/** Niedrige Energie im Check-in: 1 oder 2 von 5. */
export const LOW_ENERGY_MAX = 2;

/** Alternativen werden bei niedriger Energie oder in der Entlastung angeboten (nur mit eingeschaltetem Flag). */
export function offerEnergyAlternatives(input: { enabled: boolean; energy: number | null; deescalated: boolean }): boolean {
  return input.enabled && ((input.energy !== null && input.energy <= LOW_ENERGY_MAX) || input.deescalated);
}

/** Immer mindestens drei Alternativen (Akzeptanzkriterium): kurze Simulation, Spickzettel, nur Wiederholungen, nur eine Aufgabe. */
export const ENERGY_ALTERNATIVES: readonly EnergyAlternative[] = ["simulation", "cheat_sheet", "reviews_only", "single_task"];

/** Zielpfad der Alternativen, die keine Session starten (relativ zum Kurs). */
export function alternativeHref(mode: EnergyAlternative, certSlug: string): string | null {
  if (mode === "simulation") return `/cert/${certSlug}/simulations`;
  if (mode === "cheat_sheet") return `/cert/${certSlug}/cheatsheets`;
  return null;
}
