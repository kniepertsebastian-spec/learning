import { z } from "zod";

/**
 * Kursbeschreibung (roadmap3.md, Schritt 4): was der Kurs bietet, was man danach kann, was es bringt und wo er
 * unverzichtbar ist. Liegt je Kurs als `certifications.overview`, zweisprachig wie alle Kursinhalte. Aufwand und
 * Umfang (Lektionen, Simulationen, Fragen) stehen bewusst nicht hier, sie werden live aus dem Kurs gezählt.
 */
const text = (max: number) => z.string().trim().min(1).max(max);
const localized = <T extends z.ZodType>(inner: T) => z.object({ de: inner, en: inner });

export const OVERVIEW_LIMITS = { summary: 700, audience: 400, item: 300, why: 500, title: 120, items: 8, essential: 5 } as const;

export const courseOverviewSchema = z.object({
  /** Worum es geht, in zwei, drei Sätzen. */
  summary: localized(text(OVERVIEW_LIMITS.summary)),
  /** Für wen der Kurs gedacht ist, und was man mitbringen sollte. */
  audience: localized(text(OVERVIEW_LIMITS.audience)),
  /** „Danach kannst du …“: konkrete Fähigkeiten. */
  outcomes: localized(z.array(text(OVERVIEW_LIMITS.item)).min(1).max(OVERVIEW_LIMITS.items)),
  /** Was dir das bringt: Nutzen im Beruf und für die Prüfung. */
  benefits: localized(z.array(text(OVERVIEW_LIMITS.item)).min(1).max(OVERVIEW_LIMITS.items)),
  /** Situationen, in denen das Wissen unverzichtbar ist, jeweils mit Begründung. */
  essentialWhen: z
    .array(z.object({ title: localized(text(OVERVIEW_LIMITS.title)), why: localized(text(OVERVIEW_LIMITS.why)) }))
    .min(1)
    .max(OVERVIEW_LIMITS.essential),
  /** Was man vorher wissen sollte; leer = keine Vorkenntnisse nötig. */
  prerequisites: localized(z.array(text(OVERVIEW_LIMITS.item)).max(OVERVIEW_LIMITS.items)),
});
export type CourseOverview = z.infer<typeof courseOverviewSchema>;

/** Antwort der KI: einsprachig in der Kurssprache; die andere Sprache liefert der Übersetzungslauf. */
export const overviewDraftSchema = z.object({
  summary: text(OVERVIEW_LIMITS.summary),
  audience: text(OVERVIEW_LIMITS.audience),
  outcomes: z.array(text(OVERVIEW_LIMITS.item)).min(1).max(OVERVIEW_LIMITS.items),
  benefits: z.array(text(OVERVIEW_LIMITS.item)).min(1).max(OVERVIEW_LIMITS.items),
  essentialWhen: z.array(z.object({ title: text(OVERVIEW_LIMITS.title), why: text(OVERVIEW_LIMITS.why) })).min(1).max(OVERVIEW_LIMITS.essential),
  prerequisites: z.array(text(OVERVIEW_LIMITS.item)).max(OVERVIEW_LIMITS.items),
});
export type OverviewDraft = z.infer<typeof overviewDraftSchema>;

export type OverviewLocale = "de" | "en";

/** Einsprachiger Entwurf in beide Sprachfelder (so legt die Generierung Inhalte ab, bis übersetzt wird). */
export function overviewFromDraft(draft: OverviewDraft): CourseOverview {
  const both = <T,>(v: T) => ({ de: v, en: v });
  return {
    summary: both(draft.summary),
    audience: both(draft.audience),
    outcomes: both(draft.outcomes),
    benefits: both(draft.benefits),
    essentialWhen: draft.essentialWhen.map((e) => ({ title: both(e.title), why: both(e.why) })),
    prerequisites: both(draft.prerequisites),
  };
}

/** Eine Sprache der Beschreibung als einsprachiger Entwurf (zum Übersetzen und für die Vorschau). */
export function overviewDraftOf(overview: CourseOverview, locale: OverviewLocale): OverviewDraft {
  return {
    summary: overview.summary[locale],
    audience: overview.audience[locale],
    outcomes: overview.outcomes[locale],
    benefits: overview.benefits[locale],
    essentialWhen: overview.essentialWhen.map((e) => ({ title: e.title[locale], why: e.why[locale] })),
    prerequisites: overview.prerequisites[locale],
  };
}

/** Setzt eine Sprache der Beschreibung aus einem einsprachigen Entwurf, die andere bleibt. */
export function withOverviewLocale(overview: CourseOverview, locale: OverviewLocale, draft: OverviewDraft): CourseOverview {
  return {
    summary: { ...overview.summary, [locale]: draft.summary },
    audience: { ...overview.audience, [locale]: draft.audience },
    outcomes: { ...overview.outcomes, [locale]: draft.outcomes },
    benefits: { ...overview.benefits, [locale]: draft.benefits },
    essentialWhen: draft.essentialWhen.map((e, i) => ({
      title: { ...(overview.essentialWhen[i]?.title ?? { de: e.title, en: e.title }), [locale]: e.title },
      why: { ...(overview.essentialWhen[i]?.why ?? { de: e.why, en: e.why }), [locale]: e.why },
    })),
    prerequisites: { ...overview.prerequisites, [locale]: draft.prerequisites },
  };
}

/** Noch nicht übersetzt: beide Sprachfelder sind gleich (wie bei den übrigen Kursinhalten). */
export function overviewIsUntranslated(overview: CourseOverview): boolean {
  return JSON.stringify(overviewDraftOf(overview, "de")) === JSON.stringify(overviewDraftOf(overview, "en"));
}

const blank = { de: "", en: "" };
/** Leeres Formular der Werkstatt (nicht speicherbar, bis alles ausgefüllt ist). */
export function emptyOverview(): CourseOverview {
  return { summary: blank, audience: blank, outcomes: { de: [], en: [] }, benefits: { de: [], en: [] }, essentialWhen: [], prerequisites: { de: [], en: [] } };
}
