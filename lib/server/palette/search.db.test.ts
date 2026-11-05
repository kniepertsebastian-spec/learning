/** Suche der Command-Palette gegen eine ECHTE Postgres-Datenbank: findet Kurse, Abschnitte und Befehle, zeigt aber nie Unsichtbares. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, lessons, objectives, organizationMemberships, organizations, sections, users } from "@/lib/server/db/schema";
import type { Viewer } from "@/lib/server/catalog/visibility";
import { likeVariants, searchPalette } from "./search";

const run = TEST_DB ? describe : describe.skip;

run("Command-Palette: Suche (echte DB)", () => {
  const tag = randomUUID().slice(0, 8).replace(/-/g, "");
  const word = `zorbax${tag}`; // eindeutiges Suchwort, damit andere Testdaten nie stören
  const certIds: string[] = [];
  const userIds: string[] = [];
  let orgA = "";
  let orgB = "";
  const viewers: Record<string, NonNullable<Viewer>> = {};
  const sectionOf: Record<string, string> = {};

  beforeAll(async () => {
    const db = getDb();
    orgA = (await db.insert(organizations).values({ name: `PalA ${tag}` }).returning())[0].id;
    orgB = (await db.insert(organizations).values({ name: `PalB ${tag}` }).returning())[0].id;
    const mk = async (key: string, extra: Partial<typeof certifications.$inferInsert> = {}) => {
      const [c] = await db.insert(certifications).values({ slug: `pal-${key}-${tag}`, name: `Kurs ${word} ${key}`, provider: "Anbieter", examName: "T", examVersion: "1", ...extra }).returning();
      certIds.push(c.id);
      const [d] = await db.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "Bereich" }).returning();
      const [o] = await db.insert(objectives).values({ domainId: d.id, code: "1.1", title: "Ziel" }).returning();
      const [s] = await db.insert(sections).values({ objectiveId: o.id, orderNum: 1, title: { de: `Abschnitt ${word} ${key}`, en: `Section ${word} ${key}` } }).returning();
      await db.insert(lessons).values({
        sectionId: s.id,
        content: { de: "Inhalt", en: "Content" },
        cheatSheet: { de: `Nützlich:\n\`\`\`bash\nkubectl get ${word} -n ${key}\n\`\`\``, en: `Useful:\n\`\`\`bash\nkubectl get ${word} -n ${key}\n\`\`\`` },
      });
      sectionOf[key] = s.id;
    };
    await mk("allgemein");
    await mk("entwurf", { catalogStatus: "draft" });
    await mk("internA", { kind: "internal", ownerOrganizationId: orgA });
    await mk("internB", { kind: "internal", ownerOrganizationId: orgB });
    const mkUser = async (key: string, role: "learner" | "admin", org?: string) => {
      const [u] = await db.insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", role }).returning({ id: users.id });
      userIds.push(u.id);
      if (org) await db.insert(organizationMemberships).values({ organizationId: org, userId: u.id, role: "learner" });
      viewers[key] = { id: u.id, role };
    };
    await mkUser("solo", "learner");
    await mkUser("memberA", "learner", orgA);
    await mkUser("operator", "admin");
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(certifications).where(inArray(certifications.id, certIds));
    await db.delete(users).where(inArray(users.id, userIds));
  });

  const titles = async (viewer: NonNullable<Viewer>, q: string, locale: "de" | "en" = "de") => (await searchPalette(viewer, q, locale)).map((h) => `${h.kind}:${h.title}`);

  it("findet Kurs, Abschnitt und Befehl; Links führen zum Kurs bzw. Abschnitt", async () => {
    const hits = await searchPalette(viewers.solo, word, "de");
    expect(hits.filter((h) => h.kind === "course").map((h) => h.title)).toEqual([`Kurs ${word} allgemein`]);
    expect(hits.find((h) => h.kind === "course")?.href).toBe(`/cert/pal-allgemein-${tag}`);
    const section = hits.find((h) => h.kind === "section");
    expect(section?.title).toBe(`Abschnitt ${word} allgemein`);
    expect(section?.href).toBe(`/cert/pal-allgemein-${tag}/section/${sectionOf.allgemein}`);
    const command = hits.find((h) => h.kind === "command");
    expect(command?.title).toBe(`kubectl get ${word} -n allgemein`);
    expect(command?.href).toBe(section?.href);
  });

  it("zeigt nur, was die Person sehen darf: keine Entwürfe, nie interne Lernpfade fremder Firmen", async () => {
    const all = (hits: string[]) => hits.join("|");
    expect(all(await titles(viewers.solo, word))).not.toMatch(/entwurf|internA|internB/);
    const member = all(await titles(viewers.memberA, word));
    expect(member).toMatch(/internA/);
    expect(member).not.toMatch(/internB|entwurf/);
    // Plattform-Admins sehen Entwürfe, aber keine internen Lernpfade einer Firma.
    const operator = all(await titles(viewers.operator, word));
    expect(operator).toMatch(/entwurf/);
    expect(operator).not.toMatch(/internA|internB/);
  });

  it("Sprache: Abschnitte und Merkzettel in der Sprache der Person", async () => {
    expect(await titles(viewers.solo, `Section ${word}`, "de")).toEqual([]);
    expect((await titles(viewers.solo, `Section ${word}`, "en")).some((t) => t.startsWith("section:Section"))).toBe(true);
  });

  it("zu kurze Eingaben suchen nicht; Platzhalter in der Eingabe sind keine Platzhalter", async () => {
    expect(await searchPalette(viewers.solo, "a", "de")).toEqual([]);
    expect(await searchPalette(viewers.solo, "   ", "de")).toEqual([]);
    expect(await searchPalette(viewers.solo, "%%", "de")).toEqual([]);
    expect(await searchPalette(viewers.solo, "__", "de")).toEqual([]);
  });

  it("mehrere Begriffe müssen alle vorkommen", async () => {
    expect((await titles(viewers.solo, `${word} allgemein`)).length).toBeGreaterThan(0);
    expect(await titles(viewers.solo, `${word} gibtesnicht`)).toEqual([]);
  });

  it("likeVariants: Umschrift und Umlaute", () => {
    expect(likeVariants("pruefer")).toEqual(["pruefer", "prüfer"]);
    expect(likeVariants("kubectl")).toEqual(["kubectl"]);
    expect(likeVariants("strasse")).toEqual(["strasse", "straße"]);
  });
});
