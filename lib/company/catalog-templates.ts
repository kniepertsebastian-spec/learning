/**
 * Katalog-Gruppen als Vorlage für Firmen (docs/roadmaps/ROADMAP-UI.md, Später): „Security-Paket aus dem Katalog übernehmen“ füllt eine neue
 * Kursgruppe der Firma mit den freigegebenen Kursen einer Katalog-Gruppe. Reine Zusammenstellung ohne Datenbank; nur Kurse, die die Firma auch
 * zuweisen darf (`paths`), landen in der Vorlage. Die Firma kann die Auswahl danach frei ändern, bevor sie speichert.
 */

/** Höchstzahl der Kurse einer Firmen-Kursgruppe (siehe MAX_GROUP_ITEMS in lib/server/company/course-groups.ts). */
export const TEMPLATE_MAX_ITEMS = 30;

export interface TemplateCategory {
  id: string;
  name: { de: string; en: string };
  color: string;
  position: number;
}

export interface CatalogTemplate {
  id: string;
  name: { de: string; en: string };
  color: string;
  certificationIds: string[];
  /** Zahl der Kurse der Katalog-Gruppe, die in die Vorlage passen würden, aber über der Grenze liegen oder die Firma nicht zuweisen darf. */
  omitted: number;
}

/**
 * @param categories Katalog-Gruppen in ihrer Reihenfolge.
 * @param categoriesOf je Kurs seine Katalog-Gruppen (`categoryIdsByCertification`).
 * @param assignable Kurse, die die Firma zuweisen darf, in der Reihenfolge der Auswahlliste.
 */
export function buildCatalogTemplates(categories: readonly TemplateCategory[], categoriesOf: ReadonlyMap<string, readonly string[]>, assignable: readonly string[]): CatalogTemplate[] {
  const allowed = new Set(assignable);
  return [...categories]
    .sort((a, b) => a.position - b.position)
    .map((category) => {
      const inCategory = assignable.filter((id) => allowed.has(id) && (categoriesOf.get(id) ?? []).includes(category.id));
      const kept = inCategory.slice(0, TEMPLATE_MAX_ITEMS);
      const totalInCatalog = [...categoriesOf].filter(([, cats]) => cats.includes(category.id)).length;
      return { id: category.id, name: category.name, color: category.color, certificationIds: kept, omitted: Math.max(0, totalInCatalog - kept.length) };
    })
    .filter((t) => t.certificationIds.length > 0);
}
