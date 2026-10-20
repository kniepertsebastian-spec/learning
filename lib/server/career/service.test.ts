/** Karrierepfade und Gehalt (echte DB nur mit TEST_DATABASE_URL, KI ersetzt). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { careerSuggestions, certifications, salaryDatasets, users } from "@/lib/server/db/schema";
import { addSkill, saveProfile } from "@/lib/server/profile/service";
import { importSalaryDataset, salaryFor, SalaryImportError } from "@/lib/server/salary/service";
import { hintTerms, CareerLimitError, CareerProfileError, getCareerView, hasEnoughProfile, inputHash, MAX_RUNS_PER_DAY, refreshCareerPaths, sanitizePaths, type CareerGenerator, type CareerInput } from "./service";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);

const input: CareerInput = {
  locale: "de",
  profile: { jobTitle: "Admin", jobDescription: null, focusAreas: null, state: "BY" },
  skills: [],
  completedCourseIds: ["done"],
  certificateTitles: [],
  catalog: [{ id: "c1", name: "Kurs 1", provider: "X", topics: [] }, { id: "c2", name: "Kurs 2", provider: "X", topics: [] }, { id: "done", name: "Fertig", provider: "X", topics: [] }],
  occupationHints: [],
};
const path = (over = {}) => ({ title: "Cloud Engineer", kldb: "43104", level: 4, summary: "s", tasks: ["a"], fit: "f", missingSkills: ["IaC"], courses: [], uncoveredTopics: [], ...over });

describe("Bereinigung der KI-Antwort", () => {
  it("nur Katalogkurse, ohne Abgeschlossene und Doppelte; ungültiger Code wird leer", () => {
    const [p] = sanitizePaths({ paths: [path({ kldb: "abc", courses: [{ courseId: "c2", reason: "r" }, { courseId: "erfunden", reason: "r" }, { courseId: "done", reason: "r" }, { courseId: "c2", reason: "r" }, { courseId: "c1", reason: "r" }] })] }, input);
    expect(p.courses.map((c) => c.courseId)).toEqual(["c2", "c1"]);
    expect(p.kldb).toBe("");
    expect(p.id).toBe("1");
  });
  it("Berufshinweise folgen dem Profil, nicht einer festen Branche", () => {
    const pflege = hintTerms({ jobTitle: "Pflegefachkraft", jobDescription: "Betrieb von Wohnbereichen und Pflegedienst im Team", focusAreas: "Wundversorgung, Dokumentation", state: null }, [{ name: "Palliativpflege" }, { name: "IT" }]);
    expect(pflege).toEqual(["pflegefachkraft", "palliativpflege", "wundversorgung", "dokumentation", "wohnbereichen", "pflegedienst"]);
    expect(pflege).not.toContain("informatik");
    expect(hintTerms({ jobTitle: null, jobDescription: null, focusAreas: null, state: null }, [])).toEqual([]);
  });
  it("höchstens fünf Pfade", () => {
    expect(sanitizePaths({ paths: Array.from({ length: 6 }, () => path()) }, input)).toHaveLength(5);
  });
  it("genug Profil: Stelle oder zwei Skills; Fingerabdruck ignoriert Berufshinweise", () => {
    expect(hasEnoughProfile({ ...input, profile: { ...input.profile, jobTitle: null } })).toBe(false);
    expect(hasEnoughProfile(input)).toBe(true);
    expect(inputHash({ ...input, occupationHints: [{ kldb: "1", name: "x" }] })).toBe(inputHash(input));
    expect(inputHash({ ...input, skills: [{ kind: "skill", name: "x", level: "basic", recency: null }] })).not.toBe(inputHash(input));
  });
});

run("Karrierepfade und Gehalt (echte DB)", () => {
  const userIds: string[] = [];
  const certIds: string[] = [];
  const datasetIds: string[] = [];
  afterAll(async () => {
    const db = getDb();
    if (datasetIds.length) await db.delete(salaryDatasets).where(inArray(salaryDatasets.id, datasetIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    if (certIds.length) await db.delete(certifications).where(inArray(certifications.id, certIds));
  });
  const mkUser = async () => {
    const [u] = await getDb().insert(users).values({ email: `car-${userIds.length}-${tag}@example.com`, passwordHash: "x" }).returning({ id: users.id });
    userIds.push(u.id);
    return u.id;
  };
  const mkCert = async (name: string) => {
    const [c] = await getDb().insert(certifications).values({ slug: `ca-${certIds.length}-${tag}`, name, provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id });
    certIds.push(c.id);
    return c.id;
  };
  const csv = (rows: string[]) => ["KldB;Beruf;Niveau;Region;Median;Q1;Q3", ...rows].join("\n");
  const mapping = { occupation: 0, name: 1, level: 2, region: 3, median: 4, q25: 5, q75: 6 };
  const imp = async (referenceDate: string, rows: string[]) => {
    const r = await importSalaryDataset({ csv: csv(rows), fileName: "t.csv", headerRow: 0, mapping, defaultRegion: "DE", referenceDate, source: "Test" }, null);
    datasetIds.push(r.datasetId);
    return r;
  };

  it("Import, neuester Datensatz gilt, Ausweichen auf Berufsgruppe und auf „alle Niveaus“", async () => {
    const r = await imp("2099-12-31", ["43104;Informatik;4 Experte;Deutschland;6.000;5.000;7.000", "43104;Informatik;4 Experte;Bayern;6.300;5.200;7.300", "431;Informatik Gruppe;;Deutschland;5.000;4.000;6.000"]);
    expect(r.imported).toBe(3);
    const exact = await salaryFor("43104", 4);
    expect(exact).toMatchObject({ kldb: "43104", approximate: false, level: 4, referenceDate: "2099-12-31", source: "Test" });
    expect(exact?.regions.map((x) => [x.region, x.median])).toEqual([["DE", 6000], ["BY", 6300]]);
    const group = await salaryFor("43199", 3);
    expect(group).toMatchObject({ kldb: "431", approximate: true, level: null });
    expect(await salaryFor("99999", 1)).toBeNull();
    expect(await salaryFor("abc", 1)).toBeNull();
    await imp("2099-12-30", ["43104;Informatik;4 Experte;Deutschland;1.000;;"]); // älterer Stichtag ändert nichts
    expect((await salaryFor("43104", 4))?.regions[0].median).toBe(6000);
  });

  it("Import ohne verwertbare Zeilen wird abgelehnt", async () => {
    await expect(importSalaryDataset({ csv: csv(["x;y;;;*;;"]), fileName: null, headerRow: 0, mapping, defaultRegion: "DE", referenceDate: "2099-01-01", source: "Test" }, null)).rejects.toBeInstanceOf(SalaryImportError);
  });

  it("Pfade berechnen: zu wenig Profil, Speichern mit Gehalt und Kursstand, Veralten, Tageslimit", async () => {
    const u = await mkUser();
    const a = await mkCert(`Kurs A ${tag}`);
    const b = await mkCert(`Kurs B ${tag}`);
    let calls = 0;
    expect((await getCareerView(u, "de")).hasSalaryData).toBe(true); // Datensatz aus dem ersten Test
    const gen: CareerGenerator = async () => {
      calls++;
      return { paths: [path({ courses: [{ courseId: a, reason: "Basis" }, { courseId: b, reason: "Aufbau" }, { courseId: randomUUID(), reason: "erfunden" }] })] };
    };
    await expect(refreshCareerPaths(u, "de", gen)).rejects.toBeInstanceOf(CareerProfileError);
    await saveProfile(u, { jobTitle: "Systemadministrator", jobDescription: null, focusAreas: null, state: "BY" });
    await refreshCareerPaths(u, "de", gen);
    let view = await getCareerView(u, "de");
    expect(view.paths).toHaveLength(1);
    expect(view.paths[0].courseItems.map((c) => c.name)).toEqual([`Kurs A ${tag}`, `Kurs B ${tag}`]);
    expect(view.paths[0].salary).toMatchObject({ kldb: "43104" });
    expect(view.stale).toBe(false);
    expect(view.runsLeft).toBe(MAX_RUNS_PER_DAY - 1);
    await addSkill(u, { kind: "skill", name: "Linux", level: "expert" });
    view = await getCareerView(u, "de");
    expect(view.stale).toBe(true);
    for (let i = 0; i < MAX_RUNS_PER_DAY - 1; i++) await refreshCareerPaths(u, "de", gen);
    await expect(refreshCareerPaths(u, "de", gen)).rejects.toBeInstanceOf(CareerLimitError);
    expect(calls).toBe(MAX_RUNS_PER_DAY);
    expect((await getCareerView(u, "de")).runsLeft).toBe(0);
    await getDb().delete(careerSuggestions).where(eq(careerSuggestions.userId, u));
  });
});
