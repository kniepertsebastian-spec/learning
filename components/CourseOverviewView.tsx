import { BookOpen, Compass, Flame, ListChecks, Rocket, Sparkles } from "lucide-react";
import type { CourseOverview } from "@/lib/course-overview";
import type { CourseScope } from "@/lib/server/course-overview/service";
import type { Locale } from "@/lib/types";

const t = (locale: Locale, de: string, en: string) => (locale === "de" ? de : en);

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span className="min-w-0 break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Block({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-link" aria-hidden={true} />
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Aufwand aus dem Umfang: Lernzeit grob in Stunden, sonst Anzahl der Lektionen. */
export function scopeLine(scope: CourseScope, locale: Locale): string {
  const parts: string[] = [];
  if (scope.lessons > 0) parts.push(t(locale, `${scope.lessons} ${scope.lessons === 1 ? "Lektion" : "Lektionen"}`, `${scope.lessons} ${scope.lessons === 1 ? "lesson" : "lessons"}`));
  if (scope.simulations > 0) parts.push(t(locale, `${scope.simulations} mit Simulation`, `${scope.simulations} with simulation`));
  if (scope.questions > 0) parts.push(t(locale, `${scope.questions} ${scope.questions === 1 ? "Frage" : "Fragen"}`, `${scope.questions} ${scope.questions === 1 ? "question" : "questions"}`));
  if (scope.minutes && scope.minutes >= 30) {
    const hours = Math.round((scope.minutes / 60) * 2) / 2;
    parts.push(t(locale, `etwa ${hours.toLocaleString("de-DE")} Std. Lernzeit`, `about ${hours} h of study time`));
  }
  return parts.join(" · ");
}

/** Kursbeschreibung für Lernende (und die Vorschau der Werkstatt): ein und dieselbe Darstellung. */
export function CourseOverviewView({ overview, scope, locale }: { overview: CourseOverview; scope?: CourseScope; locale: Locale }) {
  const line = scope ? scopeLine(scope, locale) : "";
  return (
    <div className="flex flex-col gap-5" data-testid="course-overview">
      <div>
        <p className="text-sm leading-relaxed break-words">{overview.summary[locale]}</p>
        {line && <p className="mt-2 text-xs text-subtle" data-testid="overview-scope">{line}</p>}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Block icon={Rocket} title={t(locale, "Das kannst du danach", "What you will be able to do")}>
          <Bullets items={overview.outcomes[locale]} />
        </Block>
        <Block icon={Sparkles} title={t(locale, "Das bringt dir das", "What it gives you")}>
          <Bullets items={overview.benefits[locale]} />
        </Block>
      </div>
      <Block icon={Flame} title={t(locale, "Wo dieses Wissen unverzichtbar ist", "Where this knowledge is essential")}>
        <ul className="flex flex-col gap-3">
          {overview.essentialWhen.map((e, i) => (
            <li key={i} className="rounded-lg border border-border-subtle bg-surface-2 p-3 text-sm">
              <p className="font-medium break-words">{e.title[locale]}</p>
              <p className="mt-1 text-text-2 break-words">{e.why[locale]}</p>
            </li>
          ))}
        </ul>
      </Block>
      <div className="grid gap-5 md:grid-cols-2">
        <Block icon={Compass} title={t(locale, "Für wen der Kurs ist", "Who it is for")}>
          <p className="text-sm break-words">{overview.audience[locale]}</p>
        </Block>
        <Block icon={ListChecks} title={t(locale, "Vorkenntnisse", "Prerequisites")}>
          {overview.prerequisites[locale].length > 0 ? <Bullets items={overview.prerequisites[locale]} /> : <p className="text-sm">{t(locale, "Keine Vorkenntnisse nötig.", "No prior knowledge needed.")}</p>}
        </Block>
      </div>
      <Block icon={BookOpen} title={t(locale, "So lernst du hier", "How you learn here")}>
        <p className="text-sm break-words">
          {t(
            locale,
            "Du liest eine Lektion, wendest sie in einer Simulation oder einem Praxisbeispiel selbst an und prüfst dich mit Fragen. Was noch nicht sitzt, kommt automatisch in die Wiederholung.",
            "You read a lesson, apply it yourself in a simulation or practical example, and check yourself with questions. What has not stuck yet comes back automatically in your reviews.",
          )}
        </p>
      </Block>
    </div>
  );
}
