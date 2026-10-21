/** Fortschritt der Simulationen (echte DB nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, lessons, objectives, questions, reviewItems, sections, users } from "@/lib/server/db/schema";
import { extractSimulationSources, simulationIndex, stripSimulations } from "@/lib/markdown/simulation";
import { processSyncEvents } from "@/lib/server/sync/service";
import { listSimulationProgress, recordSimulationSolved, SimulationNotFoundError } from "./service";

const SIM = '```simulation\n{"type":"terminal","title":"T","scenario":"S","steps":[{"goal":"g","accept":["a"],"output":"","hint":"h"}],"success":"ok"}\n```';
const TEXT = `## Einleitung\n\nText\n\n${SIM}\n\n## Ende\n\nMehr`;

describe("Simulationen im Lektionstext", () => {
  it("entfernt nur die Simulationsblöcke und findet ihre Nummer", () => {
    const stripped = stripSimulations(TEXT);
    expect(stripped).not.toContain("simulation");
    expect(stripped).toContain("## Einleitung");
    expect(stripped).toContain("## Ende");
    const sources = extractSimulationSources(TEXT);
    expect(simulationIndex(sources, ` ${sources[0]}\n`)).toBe(0);
    expect(simulationIndex(sources, "{}")).toBe(-1);
  });

  it("andere Codeblöcke bleiben", () => {
    expect(stripSimulations("```console\n$ ls\n```")).toContain("$ ls");
  });
});

const run = TEST_DB ? describe : describe.skip;
run("Simulationsfortschritt (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const certIds: string[] = [];
  const userIds: string[] = [];
  afterAll(async () => {
    const db = getDb();
    if (certIds.length) await db.delete(certifications).where(inArray(certifications.id, certIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  });

  async function setup() {
    const d = getDb();
    const [c] = await d.insert(certifications).values({ slug: `sim-${certIds.length}-${tag}`, name: "S", provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id });
    certIds.push(c.id);
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
    const [o] = await d.insert(objectives).values({ domainId: dom.id, code: "1.1", title: "O" }).returning();
    const [sec] = await d.insert(sections).values({ objectiveId: o.id, orderNum: 1, title: { de: "A", en: "A" } }).returning();
    await d.insert(lessons).values({ sectionId: sec.id, content: { de: TEXT, en: TEXT } });
    const [q] = await d.insert(questions).values({ objectiveId: o.id, humanId: `Q-${tag}-${certIds.length}`, difficulty: "beginner", type: "knowledge", question: { de: "?", en: "?" }, explanation: { de: "!", en: "!" } }).returning();
    const [u] = await d.insert(users).values({ email: `sim-${certIds.length}-${tag}@example.com`, name: "U", passwordHash: "x" }).returning();
    userIds.push(u.id);
    const later = new Date(Date.now() + 10 * 86400_000);
    await d.insert(reviewItems).values({ userId: u.id, questionId: q.id, dueAt: later });
    return { sectionId: sec.id, userId: u.id, questionId: q.id };
  }

  it("offline gelöste Simulation kommt über die Sync-Warteschlange an, genau einmal", async () => {
    const { sectionId, userId } = await setup();
    const ev = { clientEventId: randomUUID(), type: "simulation_result" as const, clientCreatedAt: new Date().toISOString(), payload: { sectionId, simIndex: 0, helps: 1 } };
    const [first] = await processSyncEvents(userId, [ev]);
    expect(first.status).toBe("applied");
    const [again] = await processSyncEvents(userId, [ev]);
    expect(again.status).toBe("already_applied");
    expect(await listSimulationProgress(userId, sectionId)).toMatchObject([{ simIndex: 0, bestHelps: 1, solves: 1 }]);
    const [bad] = await processSyncEvents(userId, [{ ...ev, clientEventId: randomUUID(), payload: { sectionId, simIndex: 9, helps: 0 } }]);
    expect(bad.status).toBe("error");
  });

  it("speichert den Bestwert und zählt die Runden", async () => {
    const { sectionId, userId } = await setup();
    await recordSimulationSolved(userId, sectionId, 0, 1);
    await recordSimulationSolved(userId, sectionId, 0, 0);
    await recordSimulationSolved(userId, sectionId, 0, 1);
    expect(await listSimulationProgress(userId, sectionId)).toEqual([{ simIndex: 0, bestHelps: 0, solves: 3 }]);
  });

  it("mit viel Hilfe wird die Wiederholung vorgezogen, mit wenig nicht", async () => {
    const { sectionId, userId, questionId } = await setup();
    const due = async () => (await getDb().select().from(reviewItems).where(eq(reviewItems.questionId, questionId)))[0].dueAt.getTime();
    const before = await due();
    expect(await recordSimulationSolved(userId, sectionId, 0, 1)).toEqual({ struggled: false, pulledForward: 0 });
    expect(await due()).toBe(before);
    expect(await recordSimulationSolved(userId, sectionId, 0, 3)).toEqual({ struggled: true, pulledForward: 1 });
    expect(await due()).toBeLessThanOrEqual(Date.now());
  });

  it("unbekannte Simulation oder Lektion wird abgelehnt", async () => {
    const { sectionId, userId } = await setup();
    await expect(recordSimulationSolved(userId, sectionId, 5, 0)).rejects.toBeInstanceOf(SimulationNotFoundError);
    await expect(recordSimulationSolved(userId, randomUUID(), 0, 0)).rejects.toBeInstanceOf(SimulationNotFoundError);
  });
});
