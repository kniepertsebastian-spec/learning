import type { CourseBlueprintDomain, CourseBlueprintV1 } from "./schemas";

/**
 * Sehr große Kurse aufteilen (course_generation.md: „Erreicht ein valider Kurs mehr als 80 Lernziele, wird er automatisch
 * in mehrere logisch verbundene Teile aufgeteilt; Lernziele werden niemals stillschweigend entfernt“).
 *
 * - Domains bleiben ganz und in ihrer Reihenfolge; ein Teil nimmt so viele Domains auf, wie unter `max` Lernziele passen.
 * - Eine einzelne Domain mit mehr als `max` Lernzielen wird in Stücke ihrer Lernziele geteilt („Netzwerke (1/2)“).
 * - Die Teile werden möglichst gleich groß (Ziel: Gesamtzahl / Anzahl Teile), damit kein Rest-Teil mit drei Lernzielen
 *   entsteht.
 * - Die Domain-Gewichte werden je Teil auf 1 normiert (die Prüfungsgewichtung gilt im Teil relativ).
 */
export function splitBlueprint(blueprint: CourseBlueprintV1, max: number): CourseBlueprintV1[] {
  const total = blueprint.domains.reduce((n, d) => n + d.objectives.length, 0);
  if (total <= max) return [blueprint];

  // Zu große Domains vorab in Stücke teilen.
  const units: CourseBlueprintDomain[] = blueprint.domains.flatMap((d) => {
    if (d.objectives.length <= max) return [d];
    const pieces = Math.ceil(d.objectives.length / max);
    const size = Math.ceil(d.objectives.length / pieces);
    return Array.from({ length: pieces }, (_, i) => ({
      ...d,
      id: `${d.id}-${i + 1}`,
      title: `${d.title} (${i + 1}/${pieces})`,
      weight: (d.weight * Math.min(size, d.objectives.length - i * size)) / d.objectives.length,
      objectives: d.objectives.slice(i * size, (i + 1) * size),
    }));
  });

  const partCount = Math.ceil(total / max);
  const target = Math.ceil(total / partCount);
  const parts: CourseBlueprintDomain[][] = [[]];
  let size = 0;
  for (const unit of units) {
    const n = unit.objectives.length;
    const current = parts[parts.length - 1];
    // Neuer Teil, wenn der aktuelle sonst über `max` ginge oder das Ziel schon erreicht ist.
    if (current.length > 0 && (size + n > max || size >= target)) {
      parts.push([unit]);
      size = n;
    } else {
      current.push(unit);
      size += n;
    }
  }

  return parts.map((domains) => {
    const weight = domains.reduce((s, d) => s + d.weight, 0);
    return {
      ...blueprint,
      domains: domains.map((d) => ({ ...d, weight: weight > 0 ? d.weight / weight : 1 / domains.length })),
    };
  });
}

/** Titel eines Teils: „AWS Solutions Architect (Teil 2 von 3)“. */
export function partTitle(title: string, part: number, parts: number, language: "de" | "en"): string {
  return language === "en" ? `${title} (Part ${part} of ${parts})` : `${title} (Teil ${part} von ${parts})`;
}
