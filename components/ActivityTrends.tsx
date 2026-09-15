import { Download, Flame } from "lucide-react";
import type { Locale } from "@/lib/types";
import type { ActivityCalendarDay, ActivityTrendWindow } from "@/lib/server/analytics/trends";

function intensityClass(count: number): string {
  if (count === 0) return "bg-border";
  if (count === 1) return "bg-accent/30";
  if (count <= 3) return "bg-accent/60";
  return "bg-accent";
}

/** Zerlegt eine chronologische Liste (älteste zuerst) in aufeinander-
 * folgende 7er-Blöcke für eine Kalender-Heatmap - keine echte
 * Wochentag-Ausrichtung, nur eine grobe, gut lesbare Dichteansicht. */
function chunkIntoWeeks(days: ActivityCalendarDay[]): ActivityCalendarDay[][] {
  const weeks: ActivityCalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

/**
 * R3 (roadmap.md): "7-/30-/90-Tage-Trend für Mastery und Übungsaktivität
 * anzeigen" + "Aktivitätskalender beziehungsweise Lernserie ergänzen" +
 * "Datenexport als JSON oder CSV optional vorsehen". Reine Server-
 * Komponente, kein Client-JS nötig.
 */
export function ActivityTrends({
  certId,
  locale,
  trends,
  calendar,
  streak,
}: {
  certId: string;
  locale: Locale;
  trends: ActivityTrendWindow[];
  calendar: ActivityCalendarDay[];
  streak: number;
}) {
  const weeks = chunkIntoWeeks(calendar);

  return (
    <div className="mb-6 rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {locale === "de" ? "Trend & Aktivität" : "Trend & activity"}
        </h2>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-orange-600">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
              {streak} {locale === "de" ? "Tage in Folge" : "day streak"}
            </span>
          )}
          <a
            href={`/api/exams/${certId}/export`}
            className="flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {locale === "de" ? "Export (JSON)" : "Export (JSON)"}
          </a>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        {trends.map((t) => (
          <div key={t.windowDays} className="rounded-md border border-border p-3 text-center">
            <p className="text-xs text-foreground/60">
              {t.windowDays} {locale === "de" ? "Tage" : "days"}
            </p>
            <p className="text-lg font-semibold">
              {t.avgAccuracy !== null ? `${t.avgAccuracy}%` : "–"}
            </p>
            <p className="text-[11px] text-foreground/50">
              {t.activeDays} {locale === "de" ? "aktive Tage" : "active days"}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.count} ${locale === "de" ? "Aktivität(en)" : "activit(y/ies)"}`}
                className={`h-2.5 w-2.5 rounded-sm ${intensityClass(day.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
