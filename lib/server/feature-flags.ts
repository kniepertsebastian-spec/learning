/**
 * Feature-Flags der Didaktik-Roadmap (je Nutzer, stabile Zuteilung ohne gespeicherten Zustand).
 * Jedes Flag ist standardmäßig für alle an; `FEATURE_<NAME>_ROLLOUT` (0-100) setzt den Anteil, `FEATURE_<NAME>=0` schaltet hart ab.
 * Beispiel: FEATURE_PRETEST_QUESTIONS_ROLLOUT=50. Die Zuteilung hängt nur von Nutzer-ID und Konfiguration ab (reproduzierbar im Export).
 */
import { createHash } from "node:crypto";

export const FEATURE_FLAGS = ["pretest_questions", "recall_check", "understanding_mode", "dropout_guard", "exit_with_win", "energy_modes", "reactivation", "woven_reviews"] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export function isFeatureEnabled(flag: FeatureFlag, userId: string, env: Record<string, string | undefined> = process.env): boolean {
  const key = `FEATURE_${flag.toUpperCase()}`;
  if (env[key] === "0") return false;
  const raw = env[`${key}_ROLLOUT`];
  const percent = raw === undefined || raw === "" || !Number.isFinite(Number(raw)) ? 100 : Math.min(100, Math.max(0, Number(raw)));
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  const hash = createHash("sha256").update(`${flag}-v1:${userId}`).digest();
  return hash.readUInt32BE(0) % 100 < percent;
}
