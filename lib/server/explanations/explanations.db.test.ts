/** Alternativerklärungen gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { objectiveExplanations } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { backfillExplanations, type ExplanationGenerator } from "./generate";
import { approvedHelpForQuestion, explanationCounts, ExplanationNotFoundError, listDraftExplanations, reviewExplanation } from "./service";

const run = TEST_DB ? describe : describe.skip;
const text = (s: string) => ({ de: `${s} `.repeat(6).trim(), en: `${s} in English `.repeat(6).trim() });

run("Alternativerklärungen (echte DB)", () => {
  async function setup() {
    const course = await seedCourse(1);
    await seedLessons(course.objectiveId, ["Ein Router leitet Pakete anhand der Zieladresse weiter und kennt dafür eine Routing-Tabelle mit mehreren Einträgen."]);
    return course;
  }
  const generator: ExplanationGenerator = async (_source, kinds) =>
    kinds.map((kind) =>
      kind === "gapped_example"
        ? { kind, content: text("Zuerst wird die ___ gelesen, dann die Tabelle nach der ___ durchsucht."), solution: { de: "1. Zieladresse, 2. längsten Präfix-Treffer", en: "1. destination address, 2. longest prefix match" } }
        : { kind, content: text(kind === "analogy" ? "Wie ein Postbote, der nach Postleitzahl sortiert." : "Schritt für Schritt: Zuerst wird die Zieladresse gelesen.") },
    );

  it("erzeugt Entwürfe, zeigt sie Lernenden nicht, und gibt nur Freigegebenes aus; Backfill ist wiederholbar", async () => {
    const course = await setup();
    const counts = await backfillExplanations(course.certId, generator);
    expect(counts).toMatchObject({ objectives: 1, created: 3, failed: 0 });
    expect((await backfillExplanations(course.certId, generator)).created).toBe(0);

    // Entwürfe sind nie sichtbar
    expect(await approvedHelpForQuestion(course.questionIds[0], "detected")).toBeNull();
    const drafts = await listDraftExplanations(course.certId);
    expect(drafts.map((d) => d.kind).sort()).toEqual(["analogy", "gapped_example", "worked_example"]);
    expect(drafts.find((d) => d.kind === "gapped_example")!.solution?.de).toContain("Zieladresse");
    expect(drafts.find((d) => d.kind === "worked_example")!.solution).toBeNull();
    expect(await explanationCounts(course.certId)).toEqual({ draft: 3, approved: 0, rejected: 0 });

    const reviewer = await seedUser();
    const worked = drafts.find((d) => d.kind === "worked_example")!;
    const gapped = drafts.find((d) => d.kind === "gapped_example")!;
    const analogy = drafts.find((d) => d.kind === "analogy")!;
    await reviewExplanation({ id: worked.id, reviewerUserId: reviewer, decision: "approved", content: { de: "Überarbeitet: erst die Adresse lesen.", en: "Edited: read the address first." } });
    const first = await approvedHelpForQuestion(course.questionIds[0], "detected");
    expect(first?.ladder.map((l) => l.kind)).toEqual(["worked_example"]);
    expect(first?.ladder[0].content.de).toBe("Überarbeitet: erst die Adresse lesen.");
    expect(first?.extra).toBeNull();

    await reviewExplanation({ id: gapped.id, reviewerUserId: reviewer, decision: "approved", solution: { de: "Überarbeitet: Zieladresse", en: "Edited: destination address" } });
    await reviewExplanation({ id: analogy.id, reviewerUserId: reviewer, decision: "approved" });
    // Leiter: gelöstes Beispiel, dann Beispiel mit Lücken (Lösung getrennt); nach einer falschen Aufgabe ohne das gelöste Beispiel
    const detected = await approvedHelpForQuestion(course.questionIds[0], "detected");
    expect(detected?.ladder.map((l) => l.kind)).toEqual(["worked_example", "gapped_example"]);
    expect(detected?.ladder[1].solution?.de).toBe("Überarbeitet: Zieladresse");
    expect(detected?.extra?.kind).toBe("analogy");
    expect((await approvedHelpForQuestion(course.questionIds[0], "in_progress"))?.ladder.map((l) => l.kind)).toEqual(["gapped_example"]);
    expect(await explanationCounts(course.certId)).toEqual({ draft: 0, approved: 3, rejected: 0 });
    // eine Entscheidung ist endgültig
    await expect(reviewExplanation({ id: worked.id, reviewerUserId: reviewer, decision: "rejected" })).rejects.toBeInstanceOf(ExplanationNotFoundError);
  });

  it("verworfene Erklärungen werden nie gezeigt und nicht neu erzeugt; ungeeignete KI-Texte werden abgelehnt", async () => {
    const course = await setup();
    await backfillExplanations(course.certId, generator);
    const reviewer = await seedUser();
    for (const d of await listDraftExplanations(course.certId)) await reviewExplanation({ id: d.id, reviewerUserId: reviewer, decision: "rejected" });
    expect(await approvedHelpForQuestion(course.questionIds[0], "detected")).toBeNull();
    expect((await backfillExplanations(course.certId, generator)).created).toBe(0);

    const other = await setup();
    const bad: ExplanationGenerator = async (_s, kinds) => kinds.map((kind) => ({ kind, content: { de: "zu kurz", en: "too short" } }));
    expect(await backfillExplanations(other.certId, bad)).toMatchObject({ created: 0, rejected: 3 });
    expect(await getDb().select().from(objectiveExplanations).where(eq(objectiveExplanations.objectiveId, other.objectiveId))).toHaveLength(0);
  });
});
