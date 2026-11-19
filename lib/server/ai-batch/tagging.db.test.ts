/** Konzept-Tagging über die Gemini Batch API gegen echte DB, mit einem Fake-Client statt Google (nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import type { BatchClient } from "@/lib/ai/batch";
import { TAGGING_MODEL } from "@/lib/gemini";
import { getDb } from "@/lib/server/db/client";
import { aiCostEntries, concepts, geminiBatchJobs, objectives, probeVariants, questionOptions, questions, users } from "@/lib/server/db/schema";
import { objectivesToTag, type ConceptTagger, type TaggingInput } from "@/lib/server/psrp/concepts";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { pollGeminiBatches } from "./service";
import { submitTaggingBatch } from "./tagging";

const run = TEST_DB ? describe : describe.skip;

/** Eine gültige Antwort: ein Konzept über alle Items und zwei ausreichend verschiedene Varianten. */
function validResponse(itemCount: number, tag: string) {
  const variant = (text: string) => ({
    concept: "Routing",
    sourceItem: 1,
    format: "transfer" as const,
    isBottleneck: true,
    question: { de: `${text} völlig anderes Szenario ${tag}`, en: `${text} different scenario entirely ${tag}` },
    explanation: { de: "e", en: "e" },
    options: [
      { text: { de: "Richtig", en: "Right" }, isCorrect: true },
      ...[1, 2, 3].map((n) => ({ text: { de: `Falsch ${n}`, en: `Wrong ${n}` }, isCorrect: false })),
    ],
  });
  return {
    concepts: [{ name: "Routing", items: Array.from({ length: itemCount }, (_, i) => i + 1) }],
    variants: [variant("Erste Variante mit Servern"), variant("Zweite Variante mit Kabeln")],
  };
}

const answer = (body: unknown, usage = { promptTokenCount: 1_000_000, candidatesTokenCount: 200_000, cachedContentTokenCount: 0 }) => ({
  candidates: [{ content: { parts: [{ text: typeof body === "string" ? body : JSON.stringify(body) }] } }],
  usageMetadata: usage,
});

run("Konzept-Tagging als Batch (echte DB, Fake-Client)", () => {
  let userId = "";
  let certId = "";
  let objectiveA = "";
  let objectiveB = "";
  const names: string[] = [];

  /** Antworten je Auftragsname; alles andere (Aufträge anderer Tests) bleibt „in Arbeit“ und wird nicht angefasst. */
  const jobs = new Map<string, Record<string, unknown>>();
  const create = vi.fn(async () => {
    const name = `batches/test-${randomUUID()}`;
    names.push(name);
    return { name };
  });
  const client = {
    batches: { create, get: vi.fn(async ({ name }: { name: string }) => jobs.get(name) ?? { state: "JOB_STATE_RUNNING" }) },
  } as unknown as BatchClient;

  /** Ersetzt den Live-Rückfall; zählt, wofür er gebraucht wurde. */
  const liveFor: string[] = [];
  const tagger: ConceptTagger = async (input: TaggingInput) => {
    // Die Eingaben des Batch-Wegs tragen zusätzlich die Lernziel-ID.
    const objectiveId = (input as TaggingInput & { objectiveId: string }).objectiveId;
    liveFor.push(objectiveId);
    return validResponse(input.items.length, `live-${objectiveId.slice(0, 4)}`);
  };
  const prerequisites = vi.fn(async () => undefined);

  beforeAll(async () => {
    userId = await seedUser();
    const course = await seedCourse(3);
    certId = course.certId;
    objectiveA = course.objectiveId;
    const [a] = await getDb().select({ domainId: objectives.domainId }).from(objectives).where(eq(objectives.id, objectiveA)).limit(1);
    const [b] = await getDb().insert(objectives).values({ domainId: a.domainId, code: `OB-${course.tag}`, title: { de: "O2", en: "O2" } as never }).returning({ id: objectives.id });
    objectiveB = b.id;
    const extra = [];
    for (let i = 0; i < 2; i++) {
      const [q] = await getDb()
        .insert(questions)
        .values({ humanId: `QB-${course.tag}-${i}`, objectiveId: objectiveB, difficulty: "easy", type: "single", question: { de: "F2", en: "Q2" } as never, explanation: { de: "E", en: "E" } as never })
        .returning({ id: questions.id });
      extra.push(q.id);
    }
    for (const id of [...course.questionIds, ...extra]) {
      await getDb().insert(questionOptions).values({ questionId: id, orderNum: 1, text: { de: "A", en: "A" }, isCorrect: true });
    }
  });

  afterAll(async () => {
    // Alle Aufträge dieses Tests entfernen: offene würden spätere Läufe gegen dieselbe Datenbank verfälschen.
    if (names.length > 0) await getDb().delete(geminiBatchJobs).where(inArray(geminiBatchJobs.geminiName, names));
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("reicht alle ungetaggten Lernziele als einen Auftrag ein und merkt sich ihn", async () => {
    expect(await submitTaggingBatch(certId, client)).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
    const params = (create.mock.calls[0] as unknown as [{ model: string; src: Array<{ metadata: { key: string }; contents: string }> }])[0];
    expect(params.model).toBe(TAGGING_MODEL);
    expect(params.src.map((r) => r.metadata.key).sort()).toEqual([objectiveA, objectiveB].sort());
    expect(params.src[0].contents).toContain("Lernziel:");

    const rows = await getDb().select().from(geminiBatchJobs).where(eq(geminiBatchJobs.certificationId, certId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "tagging", status: "submitted", requestCount: 2, geminiName: names[0], model: TAGGING_MODEL });
  });

  it("reicht dieselben Lernziele nicht noch einmal ein, solange der Auftrag läuft (kein doppelter Preis)", async () => {
    expect(await submitTaggingBatch(certId, client)).toBe(1); // zählt den offenen Auftrag, reicht nichts Neues ein
    expect(create).not.toHaveBeenCalledTimes(1);
  });

  it("solange Google noch rechnet, passiert nichts", async () => {
    const counts = await pollGeminiBatches({ client, tagger, prerequisites });
    expect(counts).toMatchObject({ applied: 0, failed: 0 });
    const [job] = await getDb().select().from(geminiBatchJobs).where(eq(geminiBatchJobs.certificationId, certId));
    expect(job.status).toBe("submitted");
    expect(prerequisites).not.toHaveBeenCalled();
  });

  it("fertig: übernimmt gültige Antworten, nimmt für eine ungültige den Live-Weg und bucht zum halben Preis", async () => {
    jobs.set(names[0], {
      state: "JOB_STATE_SUCCEEDED",
      dest: {
        inlinedResponses: [
          { metadata: { key: objectiveA }, response: answer(validResponse(3, "batch")) },
          { metadata: { key: objectiveB }, response: answer("das ist kein JSON", { promptTokenCount: 1_000_000, candidatesTokenCount: 0, cachedContentTokenCount: 0 }) },
        ],
      },
    });
    const counts = await pollGeminiBatches({ client, tagger, prerequisites });
    expect(counts).toMatchObject({ applied: 1, failed: 0 });

    // Beide Lernziele sind getaggt, das zweite über den Live-Weg
    expect(liveFor).toEqual([objectiveB]);
    expect(await objectivesToTag(certId)).toEqual([]);
    const own = await getDb().select().from(concepts).where(eq(concepts.courseId, certId));
    expect(own.map((c) => c.name)).toEqual(["Routing"]);
    const variants = await getDb().select().from(probeVariants).where(eq(probeVariants.conceptId, own[0].id));
    expect(variants).toHaveLength(4); // je Lernziel zwei

    const [job] = await getDb().select().from(geminiBatchJobs).where(eq(geminiBatchJobs.certificationId, certId));
    expect(job.status).toBe("done");
    expect(job.message).toContain("2 Lernziele");
    expect(job.finishedAt).not.toBeNull();

    // Kostenbuch: Schritt „tagging_batch“, zum halben Preis (1 Mio. + 0,2 Mio. Token Antwort 1; 1 Mio. Eingabe Antwort 2)
    const entries = await getDb()
      .select()
      .from(aiCostEntries)
      .where(and(eq(aiCostEntries.certificationId, certId), eq(aiCostEntries.detail, "tagging_batch")));
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.source === "course_generation" && !e.byok)).toBe(true);
    const total = entries.reduce((sum, e) => sum + Number(e.costUsd), 0);
    // Standardmodell gemini-4-hydrogen: 1,50 / 7,50 je Million Token.
    expect(total).toBeCloseTo(((2_000_000 / 1e6) * 1.5 + (200_000 / 1e6) * 7.5) * 0.5, 5);

    // Voraussetzungen kommen einmal, nachdem der letzte Auftrag des Kurses erledigt ist
    expect(prerequisites).toHaveBeenCalledTimes(1);
    expect(prerequisites).toHaveBeenCalledWith(certId);
  });

  it("ein bereits verarbeiteter Auftrag wird nicht noch einmal abgefragt oder angefasst", async () => {
    const before = await getDb().select().from(probeVariants);
    const get = client.batches.get as unknown as ReturnType<typeof vi.fn>;
    get.mockClear();
    await pollGeminiBatches({ client, tagger, prerequisites });
    expect(get.mock.calls.map((call) => (call[0] as { name: string }).name)).not.toContain(names[0]);
    expect((await getDb().select().from(probeVariants)).length).toBe(before.length);
  });

  it("gescheiterter Auftrag: Live-Weg übernimmt den Rest, Auftrag steht auf failed", async () => {
    // Neuer Kurs, damit wieder alles ungetaggt ist
    const course = await seedCourse(2);
    for (const id of course.questionIds) await getDb().insert(questionOptions).values({ questionId: id, orderNum: 1, text: { de: "A", en: "A" }, isCorrect: true });
    expect(await submitTaggingBatch(course.certId, client)).toBe(1);
    jobs.set(names[names.length - 1], { state: "JOB_STATE_FAILED", error: { message: "Kontingent erschöpft" } });
    liveFor.length = 0;
    prerequisites.mockClear();

    const counts = await pollGeminiBatches({ client, tagger, prerequisites });
    expect(counts).toMatchObject({ applied: 0, failed: 1 });
    expect(liveFor).toEqual([course.objectiveId]);
    expect(await objectivesToTag(course.certId)).toEqual([]);
    const [job] = await getDb().select().from(geminiBatchJobs).where(eq(geminiBatchJobs.certificationId, course.certId));
    expect(job.status).toBe("failed");
    expect(job.message).toContain("JOB_STATE_FAILED");
    expect(prerequisites).toHaveBeenCalledWith(course.certId);
  });

  it("Abfragefehler (Netzwerk) lassen den Auftrag offen und stoppen den Lauf nicht", async () => {
    const course = await seedCourse(1);
    await getDb().insert(questionOptions).values({ questionId: course.questionIds[0], orderNum: 1, text: { de: "A", en: "A" }, isCorrect: true });
    await submitTaggingBatch(course.certId, client);
    const name = names[names.length - 1];
    const flaky = {
      batches: { create, get: vi.fn(async ({ name: n }: { name: string }) => { if (n === name) throw new Error("fetch failed"); return { state: "JOB_STATE_RUNNING" }; }) },
    } as unknown as BatchClient;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const counts = await pollGeminiBatches({ client: flaky, tagger, prerequisites });
    warn.mockRestore();
    expect(counts).toMatchObject({ applied: 0, failed: 0 });
    const [job] = await getDb().select().from(geminiBatchJobs).where(eq(geminiBatchJobs.certificationId, course.certId));
    expect(job.status).toBe("submitted");
  });

  it("eine unterbrochene Verarbeitung (applying ohne Lebenszeichen) wird wieder aufgenommen", async () => {
    const course = await seedCourse(1);
    await getDb().insert(questionOptions).values({ questionId: course.questionIds[0], orderNum: 1, text: { de: "A", en: "A" }, isCorrect: true });
    await submitTaggingBatch(course.certId, client);
    const [job] = await getDb().select().from(geminiBatchJobs).where(eq(geminiBatchJobs.certificationId, course.certId));
    await getDb().update(geminiBatchJobs).set({ status: "applying", updatedAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(geminiBatchJobs.id, job.id));
    await pollGeminiBatches({ client, tagger, prerequisites }); // setzt zurück auf submitted, Google rechnet noch
    const [after] = await getDb().select().from(geminiBatchJobs).where(eq(geminiBatchJobs.id, job.id));
    expect(after.status).toBe("submitted");
  });
});
