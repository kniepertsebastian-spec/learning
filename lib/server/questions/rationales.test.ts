/** Begründungen je falscher Option nachträglich erzeugen (echte DB nur mit TEST_DATABASE_URL, KI ersetzt). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, objectives, questionOptions, questions } from "@/lib/server/db/schema";
import { backfillRationales, validateRationales, type RationaleGenerator, type RationaleQuestion } from "./rationales";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);

describe("validateRationales", () => {
  const q: RationaleQuestion = {
    id: "q",
    question: { de: "F", en: "Q" },
    explanation: { de: "E", en: "E" },
    options: [
      { id: "a", text: { de: "a", en: "a" }, isCorrect: false },
      { id: "b", text: { de: "b", en: "b" }, isCorrect: true },
    ],
  };
  it("verlangt genau die falschen Optionen, nicht leer", () => {
    expect(validateRationales(q, { a: { de: "x", en: "y" } })).toBe(true);
    expect(validateRationales(q, {})).toBe(false);
    expect(validateRationales(q, { a: { de: " ", en: "y" } })).toBe(false);
  });
});

run("Begründungen nachträglich erzeugen (echte DB)", () => {
  const certIds: string[] = [];
  afterAll(async () => {
    if (certIds.length) await getDb().delete(certifications).where(inArray(certifications.id, certIds));
  });

  async function mkCourse(key: string, withRationale: boolean) {
    const d = getDb();
    const [c] = await d.insert(certifications).values({ slug: `rat-${key}-${tag}`, name: key, provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id });
    certIds.push(c.id);
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
    const [obj] = await d.insert(objectives).values({ domainId: dom.id, code: `R-${key}-${tag}`, title: "O" }).returning();
    const [q] = await d.insert(questions).values({ humanId: `H-${key}-${tag}`, objectiveId: obj.id, difficulty: "beginner", type: "knowledge", question: { de: "F", en: "Q" }, explanation: { de: "E", en: "E" } }).returning();
    await d.insert(questionOptions).values([1, 2, 3, 4].map((n) => ({ questionId: q.id, orderNum: n, text: { de: `o${n}`, en: `o${n}` }, isCorrect: n === 2, rationale: withRationale && n !== 2 ? { de: "ALT", en: "OLD" } : null })));
    return { certId: c.id, questionId: q.id };
  }
  const rationalesOf = async (questionId: string) => (await getDb().select({ n: questionOptions.orderNum, r: questionOptions.rationale }).from(questionOptions).where(eq(questionOptions.questionId, questionId)).orderBy(questionOptions.orderNum)).map((o) => o.r);
  const ok: RationaleGenerator = async (q) => Object.fromEntries(q.options.filter((o) => !o.isCorrect).map((o) => [o.id, { de: `weil ${o.text.de}`, en: `because ${o.text.en}` }]));

  it("ergänzt nur falsche Optionen ohne Begründung", async () => {
    const { certId, questionId } = await mkCourse("a", false);
    const res = await backfillRationales(certId, ok);
    expect(res).toMatchObject({ created: 1, failed: 0, aborted: false });
    const r = await rationalesOf(questionId);
    expect(r[1]).toBeNull();
    expect(r[0]).toEqual({ de: "weil o1", en: "because o1" });
    expect(r[2]).not.toBeNull();
  });

  it("überschreibt vorhandene Begründungen nie", async () => {
    const { certId, questionId } = await mkCourse("b", true);
    const res = await backfillRationales(certId, ok);
    expect(res.created).toBe(0);
    expect((await rationalesOf(questionId))[0]).toEqual({ de: "ALT", en: "OLD" });
  });

  it("verwirft unvollständige Antworten und bricht bei kaputtem Zugang ab", async () => {
    const { certId, questionId } = await mkCourse("c", false);
    const res = await backfillRationales(certId, async () => ({}));
    expect(res.failed).toBe(1);
    expect((await rationalesOf(questionId)).every((x) => x === null)).toBe(true);
    const down = await backfillRationales(certId, async () => { throw new Error("401"); });
    expect(down.failed).toBe(1);
  });
});
