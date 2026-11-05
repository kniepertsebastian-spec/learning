import { describe, expect, it } from "vitest";
import { buildCatalogTemplates, TEMPLATE_MAX_ITEMS, type TemplateCategory } from "./catalog-templates";

const cat = (id: string, position: number): TemplateCategory => ({ id, name: { de: `Gruppe ${id}`, en: `Group ${id}` }, color: "info", position });

describe("Katalog-Gruppen als Vorlage für Firmen", () => {
  it("nimmt je Katalog-Gruppe die Kurse, die die Firma zuweisen darf, in der Reihenfolge der Auswahlliste", () => {
    const categoriesOf = new Map([
      ["k1", ["sec"]],
      ["k2", ["sec", "cloud"]],
      ["k3", ["cloud"]],
      ["k4", ["sec"]], // Firma darf diesen Kurs nicht zuweisen
    ]);
    const templates = buildCatalogTemplates([cat("cloud", 2), cat("sec", 1)], categoriesOf, ["k3", "k2", "k1"]);
    expect(templates.map((t) => t.id)).toEqual(["sec", "cloud"]); // nach Position der Katalog-Gruppe
    expect(templates[0].certificationIds).toEqual(["k2", "k1"]);
    expect(templates[1].certificationIds).toEqual(["k3", "k2"]);
    expect(templates[0].omitted).toBe(1); // k4 steckt in der Katalog-Gruppe, passt aber nicht
    expect(templates[1].omitted).toBe(0);
  });

  it("Katalog-Gruppen ohne passenden Kurs erscheinen nicht", () => {
    expect(buildCatalogTemplates([cat("leer", 1), cat("sec", 2)], new Map([["k1", ["sec"]]]), ["k1"]).map((t) => t.id)).toEqual(["sec"]);
    expect(buildCatalogTemplates([cat("sec", 1)], new Map(), ["k1"])).toEqual([]);
    expect(buildCatalogTemplates([], new Map([["k1", ["sec"]]]), ["k1"])).toEqual([]);
  });

  it("höchstens so viele Kurse wie eine Kursgruppe fasst; der Rest steht in `omitted`", () => {
    const ids = Array.from({ length: TEMPLATE_MAX_ITEMS + 5 }, (_, i) => `k${i}`);
    const [template] = buildCatalogTemplates([cat("big", 1)], new Map(ids.map((id) => [id, ["big"]])), ids);
    expect(template.certificationIds).toHaveLength(TEMPLATE_MAX_ITEMS);
    expect(template.certificationIds[0]).toBe("k0");
    expect(template.omitted).toBe(5);
  });
});
