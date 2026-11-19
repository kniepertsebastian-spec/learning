import { describe, expect, it } from "vitest";
import { c_notFound } from "./not-found";

describe("Texte der Fehlerseiten (R9)", () => {
  it("gibt es auf Deutsch und Englisch", () => {
    const de = c_notFound("de");
    const en = c_notFound("en");
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const value of [...Object.values(de), ...Object.values(en)]) expect(value.length).toBeGreaterThan(0);
  });
});
