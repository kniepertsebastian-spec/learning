/** Nachfrage zum Prüfungsergebnis (roadmap_didaktik Phase 7): 1 Tag nach dem Termin, bei „noch nicht“ erneut nach 7 Tagen. */
export const RESULT_PROMPT_DELAY_DAYS = 1;
export const RESULT_SNOOZE_DAYS = 7;
/** Schlüssel in `exam_plans.reminders_sent` (bis wann „noch nicht“ gilt). */
export const RESULT_SNOOZE_KEY = "result_snooze";

const DAY_MS = 86_400_000;

export function resultPromptDue(
  plan: { status: "planned" | "passed" | "failed" | "cancelled"; scheduledAt: Date | null; remindersSent: Record<string, string> },
  now: Date,
): boolean {
  if (plan.status !== "planned" || !plan.scheduledAt) return false;
  if (now.getTime() < plan.scheduledAt.getTime() + RESULT_PROMPT_DELAY_DAYS * DAY_MS) return false;
  const snoozedUntil = plan.remindersSent[RESULT_SNOOZE_KEY];
  return !snoozedUntil || now.getTime() >= new Date(snoozedUntil).getTime();
}

export function snoozeUntil(now: Date): string {
  return new Date(now.getTime() + RESULT_SNOOZE_DAYS * DAY_MS).toISOString();
}
