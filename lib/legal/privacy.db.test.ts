/** Aufgabe 07b (Review 12.11.2026): Jede Angabe im Datenexport steht mit Zweck in der Datenschutzerklärung. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { exportAccountData } from "@/lib/server/account/export";
import { seedUser } from "@/lib/server/psrp/test-db";
import { PRIVACY_ENTRIES, PRIVACY_TECHNICAL } from "./privacy";

const run = TEST_DB ? describe : describe.skip;

/** Die Schlüssel des Exports in der Schreibweise der Erklärung: `account`, `company.x`, `learning.x`, `activity.x`. */
function exportKeys(data: Record<string, unknown>): string[] {
  const keys: string[] = ["account"];
  for (const group of ["company", "learning", "activity"] as const) {
    for (const key of Object.keys(data[group] as object)) keys.push(`${group}.${key}`);
  }
  return keys;
}

run("Datenschutzerklärung und Datenexport (echte DB)", () => {
  it("jeder Teil des Datenexports wird von genau einem Eintrag der Erklärung erklärt", async () => {
    const data = (await exportAccountData(await seedUser()))!;
    const covered = PRIVACY_ENTRIES.flatMap((e) => e.exportKeys);
    const missing = exportKeys(data).filter((key) => !covered.includes(key));
    expect(missing, `Im Export, aber nicht in lib/legal/privacy.ts: ${missing.join(", ")}`).toEqual([]);
    expect(covered.filter((key, i) => covered.indexOf(key) !== i), "doppelt erklärt").toEqual([]);
  });

  it("jeder Schlüssel der Erklärung gibt es im Datenexport", async () => {
    const data = (await exportAccountData(await seedUser()))!;
    const real = new Set(exportKeys(data));
    const unknown = PRIVACY_ENTRIES.flatMap((e) => e.exportKeys).filter((key) => !real.has(key));
    expect(unknown, `In lib/legal/privacy.ts, aber nicht im Export: ${unknown.join(", ")}`).toEqual([]);
  });
});

describe("Einträge der Datenschutzerklärung", () => {
  it("jeder Eintrag hat Angaben, Zweck, Speicherdauer und Empfänger in beiden Sprachen", () => {
    for (const entry of PRIVACY_ENTRIES) {
      for (const field of ["title", "data", "purpose", "retention", "recipients"] as const) {
        const min = field === "title" ? 3 : 10;
        expect(entry[field].de.length, `${entry.id}.${field}.de`).toBeGreaterThan(min);
        expect(entry[field].en.length, `${entry.id}.${field}.en`).toBeGreaterThan(min);
      }
    }
    expect(new Set(PRIVACY_ENTRIES.map((e) => e.id)).size).toBe(PRIVACY_ENTRIES.length);
    expect(PRIVACY_TECHNICAL.length).toBeGreaterThan(0);
  });

  it("die Angaben, die die Prüfung nennt, stehen drin: Tagesform, Zeitbudget, Arbeitstag, Altersspanne, Tageszeit-Profil, Selbsteinschätzung, Berufsprofil, Skills", () => {
    const all = JSON.stringify(PRIVACY_ENTRIES).toLowerCase();
    for (const term of ["tagesform", "zeitbudget", "arbeitstag", "altersspanne", "tageszeit-profil", "selbsteinschätzung", "berufsbezeichnung", "skills"]) {
      expect(all, term).toContain(term);
    }
  });

  it("der KI-Dienst bei den Karrierepfaden ist als Empfänger genannt", () => {
    const career = PRIVACY_ENTRIES.find((e) => e.id === "berufsprofil")!;
    expect(career.recipients.de).toMatch(/Gemini/);
    expect(career.recipients.en).toMatch(/Gemini/);
  });
});
