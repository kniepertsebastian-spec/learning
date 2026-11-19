import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageSkeleton } from "./PageSkeleton";
import { c_notFound } from "@/lib/i18n/components/not-found";

describe("Ladezustand und Fehlerseiten (R9)", () => {
  it("der Platzhalter ist für Screenreader ein Status mit Text", () => {
    for (const variant of ["dashboard", "course", "session", "list"] as const) {
      const html = renderToStaticMarkup(<PageSkeleton variant={variant} />);
      expect(html).toContain('role="status"');
      expect(html).toContain(`page-skeleton-${variant}`);
      expect(html).toContain("Wird geladen");
    }
  });

  it("alle Texte gibt es auf Deutsch und Englisch", () => {
    const de = c_notFound("de");
    const en = c_notFound("en");
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const value of [...Object.values(de), ...Object.values(en)]) expect(value.length).toBeGreaterThan(0);
  });
});
