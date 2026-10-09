/** Lernblöcke nachträglich ergänzen (echte DB nur mit TEST_DATABASE_URL, KI ersetzt). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, lessons, objectives, sections } from "@/lib/server/db/schema";
import { acceptBlocks, backfillBlocks, HAS_BLOCKS, preservesContent, type BlocksGenerator } from "./blocks-backfill";
import { LEARNING_BLOCKS_PROMPT } from "@/lib/server/course-generation/providers";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);
const BASE = "Pods sind die kleinste Einheit in Kubernetes und laufen auf Knoten.\n\nEin Deployment verwaltet mehrere Replikas eines Pods automatisch.";
const WITH = `${BASE}\n\n> [!EXAM]\n> Prüfungsrelevant: describe.\n`;

describe("Prüfregeln", () => {
  it("Originaltext muss erhalten bleiben", () => {
    expect(preservesContent(BASE, WITH)).toBe(true);
    expect(preservesContent(BASE, "> [!EXAM]\n> ganz anderer Text")).toBe(false);
  });
  it("Blöcke müssen gültig und vorhanden sein", () => {
    const o = { de: BASE, en: BASE };
    expect(acceptBlocks(o, { de: WITH, en: WITH })).toBe(true);
    expect(acceptBlocks(o, { de: BASE, en: BASE })).toBe(false);
    expect(acceptBlocks(o, { de: WITH + "\n:::tabs\n", en: WITH })).toBe(false);
    expect(HAS_BLOCKS.test(WITH)).toBe(true);
  });
  it("der Generator-Prompt verlangt die Blöcke und verbietet Erfundenes", () => {
    const p = LEARNING_BLOCKS_PROMPT.join("\n");
    expect(p).toContain("[!EXAM]");
    expect(p).toContain(":::practice");
    expect(p).toContain("console");
    expect(p).toContain("Erfinde keine");
  });
});

run("Lernblöcke nachträglich ergänzen (echte DB)", () => {
  const certIds: string[] = [];
  afterAll(async () => {
    if (certIds.length) await getDb().delete(certifications).where(inArray(certifications.id, certIds));
  });
  async function mk(content: string[]) {
    const d = getDb();
    const [c] = await d.insert(certifications).values({ slug: `blk-${certIds.length}-${tag}`, name: "B", provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id });
    certIds.push(c.id);
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
    const [obj] = await d.insert(objectives).values({ domainId: dom.id, code: `B-${certIds.length}-${tag}`, title: "O" }).returning();
    const ids: string[] = [];
    for (const [i, text] of content.entries()) {
      const [s] = await d.insert(sections).values({ objectiveId: obj.id, orderNum: i + 1, title: { de: `L${i}`, en: `L${i}` } }).returning();
      const [l] = await d.insert(lessons).values({ sectionId: s.id, content: { de: text, en: text } }).returning({ id: lessons.id });
      ids.push(l.id);
    }
    return { certId: c.id, ids };
  }
  const contentOf = async (id: string) => (await getDb().select({ c: lessons.content }).from(lessons).where(eq(lessons.id, id)))[0].c;
  const good: BlocksGenerator = async (l) => ({ de: l.content.de + "\n\n> [!EXAM]\n> x\n", en: l.content.en + "\n\n> [!EXAM]\n> x\n" });

  it("ergänzt Blöcke, lässt Lektionen mit Blöcken unberührt", async () => {
    const { certId, ids } = await mk([BASE, WITH]);
    const res = await backfillBlocks(certId, good);
    expect(res).toMatchObject({ updated: 1, skipped: 1, failed: 0 });
    expect((await contentOf(ids[0])).de).toContain("[!EXAM]");
    expect((await contentOf(ids[1])).de).toBe(WITH);
  });
  it("lehnt Antworten ab, die den Text verändern", async () => {
    const { certId, ids } = await mk([BASE]);
    const res = await backfillBlocks(certId, async () => ({ de: "> [!EXAM]\n> neu", en: "> [!EXAM]\n> new" }));
    expect(res.failed).toBe(1);
    expect((await contentOf(ids[0])).de).toBe(BASE);
  });
});
