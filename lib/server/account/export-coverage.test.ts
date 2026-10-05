/**
 * Vollständigkeits-Test für Export und Löschung (ohne Datenbank): Jede Spalte mit Fremdschlüssel
 * auf `users` muss entweder im Datenexport stehen oder mit Begründung ausgenommen sein. Wer eine
 * neue Tabelle mit Verweis auf users anlegt, bekommt hier einen roten Test und muss entscheiden,
 * ob die Daten in den Export gehören (Auskunft/Portabilität).
 */
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/lib/server/db/schema";
import { EXCLUDED_USER_REFERENCES, EXPORTED_USER_REFERENCES } from "./export";

function userReferences(): string[] {
  const refs: string[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    for (const fk of config.foreignKeys) {
      const reference = fk.reference();
      if (getTableName(reference.foreignTable) !== "users") continue;
      for (const column of reference.columns) refs.push(`${config.name}.${column.name}`);
    }
  }
  return refs.sort();
}

describe("Export deckt alle Verweise auf users ab", () => {
  const found = userReferences();

  it("findet die Verweise im Schema (sonst prüft der Test nichts)", () => {
    expect(found.length).toBeGreaterThanOrEqual(20);
  });

  it("jeder Verweis ist exportiert oder begründet ausgenommen", () => {
    const known = new Set([...EXPORTED_USER_REFERENCES, ...Object.keys(EXCLUDED_USER_REFERENCES)]);
    const unknown = found.filter((ref) => !known.has(ref));
    expect(unknown, `Neue Verweise auf users ohne Export-Entscheidung: ${unknown.join(", ")}`).toEqual([]);
  });

  it("die Liste enthält keine veralteten Einträge", () => {
    const foundSet = new Set(found);
    const stale = [...EXPORTED_USER_REFERENCES, ...Object.keys(EXCLUDED_USER_REFERENCES)].filter(
      (ref) => !foundSet.has(ref),
    );
    expect(stale, `Einträge ohne Gegenstück im Schema: ${stale.join(", ")}`).toEqual([]);
  });

  it("kein Eintrag steht gleichzeitig in Export und Ausnahmen, jede Ausnahme hat eine Begründung", () => {
    for (const ref of EXPORTED_USER_REFERENCES) expect(EXCLUDED_USER_REFERENCES[ref]).toBeUndefined();
    for (const reason of Object.values(EXCLUDED_USER_REFERENCES)) expect(reason.length).toBeGreaterThan(10);
  });
});
