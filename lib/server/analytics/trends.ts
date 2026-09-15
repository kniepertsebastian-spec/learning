/**
 * R3 (roadmap.md): "7-/30-/90-Tage-Trend für Mastery und Übungsaktivität
 * anzeigen" - reine Aggregationslogik (kein DB-Zugriff), analog zu
 * lib/server/readiness/engine.ts. Arbeitet auf flachen Ereignislisten
 * (Zeitpunkt + ggf. Ergebnis), die lib/server/analytics/learner-activity.ts
 * aus quiz_attempts/exam_attempts/study_sessions zusammenstellt - bewusst
 * NICHT aus review_items, weil das pro (Nutzer, Frage) nur den LETZTEN
 * Zustand hält (upsert, siehe R2.2), also keine echte Historie über die Zeit
 * liefern kann; quiz_attempts/exam_attempts sind dagegen echte Ereignis-Logs
 * (eine Zeile pro Versuch, nie überschrieben).
 */

export interface AccuracyEvent {
  date: Date;
  /** Ergebnis dieses einen Versuchs, 0-100. */
  score: number;
}

export interface ActivityTrendWindow {
  windowDays: number;
  /** Anzahl unterschiedlicher Kalendertage mit mindestens einer Aktivität
   * (Quiz, Probeprüfung oder Lernsession) innerhalb des Fensters. */
  activeDays: number;
  /** Gesamtzahl der Aktivitäts-Ereignisse (Versuche/Sessions) im Fenster. */
  totalActivityEvents: number;
  /** Durchschnittliches Ergebnis der Quiz-/Exam-Versuche im Fenster, 0-100 -
   * `null`, wenn im Fenster keiner liegt ("fehlende Daten als fehlende Daten
   * zeigen", nicht als 0). */
  avgAccuracy: number | null;
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Berechnet für jedes der übergebenen Zeitfenster (typischerweise
 * [7, 30, 90]) Übungsaktivität und durchschnittliches Ergebnis.
 */
export function computeActivityTrends(
  activityDates: Date[],
  accuracyEvents: AccuracyEvent[],
  windowsDays: number[],
  now: Date = new Date(),
): ActivityTrendWindow[] {
  return windowsDays.map((windowDays) => {
    const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

    const activityInWindow = activityDates.filter((d) => d.getTime() >= cutoff && d.getTime() <= now.getTime());
    const accuracyInWindow = accuracyEvents.filter(
      (e) => e.date.getTime() >= cutoff && e.date.getTime() <= now.getTime(),
    );

    const activeDays = new Set(activityInWindow.map(toDayKey)).size;
    const avgAccuracy =
      accuracyInWindow.length > 0
        ? accuracyInWindow.reduce((sum, e) => sum + e.score, 0) / accuracyInWindow.length
        : null;

    return {
      windowDays,
      activeDays,
      totalActivityEvents: activityInWindow.length,
      avgAccuracy: avgAccuracy !== null ? Math.round(avgAccuracy) : null,
    };
  });
}

export interface ActivityCalendarDay {
  date: string; // "YYYY-MM-DD"
  count: number;
}

/**
 * "Aktivitätskalender ... ergänzen" (roadmap.md): tageweise Aktivitätszahl
 * für die letzten `days` Tage (älteste zuerst), z. B. für eine
 * Heatmap-Darstellung. Tage ohne Aktivität sind explizit mit `count: 0`
 * enthalten statt zu fehlen, damit ein Kalenderraster ohne Lücken gebaut
 * werden kann.
 */
export function buildActivityCalendar(
  activityDates: Date[],
  days: number,
  now: Date = new Date(),
): ActivityCalendarDay[] {
  const countByDay = new Map<string, number>();
  for (const date of activityDates) {
    const key = toDayKey(date);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const calendar: ActivityCalendarDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const key = toDayKey(day);
    calendar.push({ date: key, count: countByDay.get(key) ?? 0 });
  }
  return calendar;
}
