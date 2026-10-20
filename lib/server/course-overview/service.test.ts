/** Kursbeschreibung: reine Funktionen immer, Service mit echter DB nur mit TEST_DATABASE_URL (KI ersetzt). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { inArray } from "drizzle-orm";
import { courseOverviewSchema, overviewDraftOf, overviewFromDraft, overviewIsUntranslated, withOverviewLocale, type OverviewDraft } from "@/lib/course-overview";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, lessons, objectives, sections } from "@/lib/server/db/schema";
import { generateOverviewDraft, getCourseOverview, getCourseScope, saveCourseOverview, translateCourseOverview } from "./service";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);

const draft: OverviewDraft = {
  summary: "Du lernst, ein Netzwerk sicher zu betreiben.",
  audience: "Für alle, die Systeme betreuen.",
  outcomes: ["Du richtest eine Firewall ein."],
  benefits: ["Du findest Fehler schneller."],
  essentialWhen: [{ title: "Nach einem Einbruch", why: "Ohne das Wissen findest du die Lücke nicht." }],
  prerequisites: [],
};

describe("Kursbeschreibung (Typ)", () => {
  it("einsprachiger Entwurf füllt beide Sprachen und gilt als unübersetzt", () => {
    const o = overviewFromDraft(draft);
    expect(courseOverviewSchema.safeParse(o).success).toBe(true);
    expect(overviewIsUntranslated(o)).toBe(true);
  });

  it("withOverviewLocale setzt nur die Zielsprache", () => {
    const o = overviewFromDraft(draft);
    const en = withOverviewLocale(o, "en", { ...draft, summary: "You learn to run a network safely.", essentialWhen: [{ title: "After a breach", why: "Without it you miss the gap." }] });
    expect(en.summary).toEqual({ de: draft.summary, en: "You learn to run a network safely." });
    expect(en.essentialWhen[0].title).toEqual({ de: "Nach einem Einbruch", en: "After a breach" });
    expect(overviewIsUntranslated(en)).toBe(false);
    expect(overviewDraftOf(en, "de")).toEqual(draft);
  });

  it("lehnt leere Pflichtfelder und zu viele Situationen ab", () => {
    expect(courseOverviewSchema.safeParse({ ...overviewFromDraft(draft), outcomes: { de: [], en: [] } }).success).toBe(false);
    const many = { ...draft, essentialWhen: Array.from({ length: 6 }, () => draft.essentialWhen[0]) };
    expect(courseOverviewSchema.safeParse(overviewFromDraft(many)).success).toBe(false);
  });
});

run("Kursbeschreibung (echte DB)", () => {
  const certIds: string[] = [];
  afterAll(async () => {
    if (certIds.length) await getDb().delete(certifications).where(inArray(certifications.id, certIds));
  });

  async function mkCourse(contentLocale: "de" | "en" = "de") {
    const d = getDb();
    const [c] = await d.insert(certifications).values({ slug: `ov-${certIds.length}-${tag}`, name: "Netz", provider: "T", examName: "N-1", examVersion: "1", contentLocale }).returning({ id: certifications.id });
    certIds.push(c.id);
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "Sicherheit" }).returning();
    const [o] = await d.insert(objectives).values({ domainId: dom.id, code: "1.1", title: "Firewalls" }).returning();
    const [s] = await d.insert(sections).values({ objectiveId: o.id, orderNum: 1, title: { de: "A", en: "A" }, estimatedMinutes: 90 }).returning();
    await d.insert(lessons).values({ sectionId: s.id, content: { de: "Text\n```simulation\n{}\n```", en: "x" } });
    return { id: c.id };
  }

  it("zählt den Umfang live", async () => {
    const { id } = await mkCourse();
    const scope = await getCourseScope(id);
    expect(scope).toMatchObject({ lessons: 1, simulations: 1, questions: 0, minutes: 90 });
  });

  it("Entwurf wird nicht gespeichert, Speichern und Lesen stimmen überein", async () => {
    const { id } = await mkCourse();
    let seenLocale = "";
    const o = await generateOverviewDraft(id, { generate: async (_s, user, locale) => { seenLocale = locale; expect(user).toContain("Firewalls"); return draft; } });
    expect(seenLocale).toBe("de");
    expect(await getCourseOverview(id)).toBeNull();
    await saveCourseOverview(id, o);
    expect(await getCourseOverview(id)).toEqual(o);
  });

  it("übersetzt nur die Zielsprache und nur einmal", async () => {
    const { id } = await mkCourse("de");
    await saveCourseOverview(id, overviewFromDraft(draft));
    const english: OverviewDraft = { ...draft, summary: "You learn to run a network safely.", essentialWhen: [{ title: "After a breach", why: "Without it you miss the gap." }] };
    let calls = 0;
    const translator = async (_d: OverviewDraft, source: string, target: string) => {
      calls++;
      expect([source, target]).toEqual(["de", "en"]);
      return english;
    };
    expect(await translateCourseOverview(id, translator)).toBe("translated");
    expect(await translateCourseOverview(id, translator)).toBe("skipped");
    expect(calls).toBe(1);
    const saved = (await getCourseOverview(id))!;
    expect(saved.summary).toEqual({ de: draft.summary, en: english.summary });
  });

  it("Kurs ohne Themenbereiche bekommt keinen Entwurf", async () => {
    const [c] = await getDb().insert(certifications).values({ slug: `ov-empty-${tag}`, name: "Leer", provider: "T", examName: "E", examVersion: "1" }).returning({ id: certifications.id });
    certIds.push(c.id);
    await expect(generateOverviewDraft(c.id, { generate: async () => draft })).rejects.toThrow(/Themenbereiche/);
  });
});
