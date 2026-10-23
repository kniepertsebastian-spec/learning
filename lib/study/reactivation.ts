/** Reaktivierung ohne Beschämung (roadmap_motivation Phase 6): wann welche Mail fällig ist. Reine Regeln, ohne Datenbank. */

export const REACTIVATION_STAGES = [
  { stage: "d5", days: 5 },
  { stage: "d12", days: 12 },
  { stage: "d26", days: 26 },
] as const;
export type Stage = (typeof REACTIVATION_STAGES)[number]["stage"];

/** Nach so vielen Tagen ohne Aktivität ruht es ganz: wer so lange weg ist, bekommt keine weitere Mail. */
export const REACTIVATION_MAX_DAYS = 60;
/** Ruhezeiten: nur tagsüber in der Zeitzone der Person. */
export const QUIET_FROM_HOUR = 8;
export const QUIET_TO_HOUR = 20;

const DAY_MS = 86_400_000;

/** Die Stufe, die jetzt fällig ist, oder null. Höchstens eine Mail je Lauf und nie dieselbe Stufe zweimal je Pause. */
export function dueStage(input: { lastActivityAt: Date | null; now: Date; sentSinceActivity: readonly Stage[] }): Stage | null {
  if (!input.lastActivityAt) return null; // wer nie gelernt hat, wird nicht „reaktiviert“
  const days = (input.now.getTime() - input.lastActivityAt.getTime()) / DAY_MS;
  if (days < REACTIVATION_STAGES[0].days || days > REACTIVATION_MAX_DAYS) return null;
  // Die späteste erreichte Stufe, die noch nicht verschickt wurde. Frühere Stufen werden nie nachgeholt (kein Stapel von Mails).
  const reached = REACTIVATION_STAGES.filter((s) => days >= s.days);
  const latest = reached[reached.length - 1];
  return input.sentSinceActivity.includes(latest.stage) ? null : latest.stage;
}

export function isQuietHour(now: Date, timeZone: string): boolean {
  let hour: number;
  try {
    hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(now));
  } catch {
    hour = now.getUTCHours();
  }
  return hour < QUIET_FROM_HOUR || hour >= QUIET_TO_HOUR;
}
