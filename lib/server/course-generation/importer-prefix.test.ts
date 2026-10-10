/**
 * Frage-IDs zweier Kurse desselben Herstellers dürfen nicht kollidieren („comptia-…“ → beide „COM“): der Import des
 * zweiten Kurses scheiterte sonst an der Eindeutigkeit von questions.human_id. Echte DB (nur mit TEST_DATABASE_URL).
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, objectives, questions } from "@/lib/server/db/schema";
import { buildSampleCoursePackage } from "./fixtures";
import { importCoursePackage } from "./importer";

const run = TEST_DB ? describe : describe.skip;

run("Präfix der Frage-IDs beim Import (echte DB)", () => {
  const certIds: string[] = [];
  afterAll(async () => {
    if (certIds.length) await getDb().delete(certifications).where(inArray(certifications.id, certIds));
  });

  async function humanIdsOf(certId: string) {
    const rows = await getDb()
      .select({ humanId: questions.humanId })
      .from(questions)
      .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(eq(domains.certificationId, certId));
    return rows.map((r) => r.humanId);
  }

  it("zwei Kurse mit gleichem Slug-Anfang bekommen verschiedene Präfixe und lassen sich beide importieren", async () => {
    const tag = randomUUID().slice(0, 6);
    const first = await importCoursePackage(buildSampleCoursePackage(`a${tag}`), `zz${tag}-alpha-course`);
    certIds.push(first.certificationId);
    const second = await importCoursePackage(buildSampleCoursePackage(`b${tag}`), `zz${tag}-beta-course`);
    certIds.push(second.certificationId);

    const a = await humanIdsOf(first.certificationId);
    const b = await humanIdsOf(second.certificationId);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    const prefixOf = (id: string) => id.split("-")[0];
    expect(new Set(b.map(prefixOf))).not.toEqual(new Set(a.map(prefixOf)));
    expect(b.some((id) => a.includes(id))).toBe(false);
  });
});
