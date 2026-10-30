import Link from "next/link";
import { Radar } from "lucide-react";
import type { WeaknessRadar as Radar_ } from "@/lib/server/weakness/radar";
import type { Locale } from "@/lib/types";

/**
 * Schwächen-Radar in der Statusleiste des Kurses (neben „Offline verfügbar“): ein Knopf mit der Zahl der Themen, die noch Nachbereitung
 * brauchen; aufgeklappt die Top 3 mit „x von y Fragen noch falsch“ und Sprung zur Wiederholung. Ohne Quiz-Antworten gibt es ihn nicht.
 */
export function WeaknessRadar({ radar, slug, locale }: { radar: Radar_; slug: string; locale: Locale }) {
  if (!radar.hasData) return null;
  const de = locale === "de";
  const count = radar.topics.length;
  return (
    <details className="group relative" data-testid="weakness-radar">
      <summary
        className={`flex cursor-pointer list-none items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-surface ${count > 0 ? "text-warning-text" : "text-foreground/70"}`}
        data-testid="weakness-radar-toggle"
      >
        <Radar className="h-4 w-4" aria-hidden="true" />
        {de ? "Schwächen-Radar" : "Weakness radar"}
        <span className={`rounded-full px-1.5 text-xs ${count > 0 ? "bg-warning-soft" : "bg-mint-soft text-mint-text"}`} data-testid="weakness-radar-count">{count}</span>
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-[min(22rem,90vw)] rounded-xl border border-border bg-surface p-3 text-sm shadow-overlay" data-testid="weakness-radar-panel">
        {count === 0 ? (
          <p className="text-foreground/70" data-testid="weakness-radar-none">{de ? "Keine Schwachstellen erkannt: Deine letzten Antworten aus den Quizzes waren richtig." : "No weak spots found: your latest quiz answers were correct."}</p>
        ) : (
          <>
            <p className="mb-2 font-medium">{de ? "Hier lohnt sich Nachbereitung" : "Worth reviewing"}</p>
            <ol className="flex flex-col gap-2">
              {radar.topics.map((t) => (
                <li key={t.objectiveId} data-testid="weakness-radar-topic">
                  <Link href={`/cert/${slug}/remediation/${t.objectiveId}`} className="font-medium text-link hover:underline">
                    <span className="font-mono text-xs text-subtle">{t.code}</span> {t.title}
                  </Link>
                  <span className="block text-xs text-subtle">{de ? `${t.wrong} von ${t.answered} Fragen zuletzt falsch beantwortet` : `${t.wrong} of ${t.answered} questions last answered wrong`}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-subtle">{de ? "Aus deinen „Sitzt das?“-Quizzes. Zählt je Frage die letzte Antwort." : "From your “Does it stick?” quizzes. Counts the latest answer per question."}</p>
          </>
        )}
      </div>
    </details>
  );
}
