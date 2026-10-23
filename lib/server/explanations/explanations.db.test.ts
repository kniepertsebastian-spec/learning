/** Alternativerklärungen gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { objectiveExplanations } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { backfillExplanations, type ExplanationGenerator } from "./generate";
import { approvedExplanationForQuestion, explanationCounts, ExplanationNotFoundError, listDraftExplanations, reviewExplanation } from "./service";

const run = TEST_DB ? describe : describe.skip;
const text = (s: string) => ({ de: `${s} `.repeat(6).trim(), en: `${s} in English `.repeat(6).trim() });

run("Alternativerklärungen (echte DB)", () => {
  async function setup() {
    const course = await seedCourse(1);
    await seedLessons(course.objectiveId, ["Ein Router leitet Pakete anhand der Zieladresse weiter und kennt dafür eine Routing-Tabelle mit mehreren Einträgen."]);
    return course;
  }
  const generator: ExplanationGenerator = async (_source, kinds) => kinds.map((kind) => ({ kind, content: text(kind === "analogy" ? "Wie ein Postbote, der nach Postleitzahl sortiert." : "Schritt für Schritt: Zuerst wird die Zieladresse gelesen.") }));

  it("erzeugt Entwürfe, zeigt sie Lernenden nicht, und gibt nur Freigegebenes aus; Backfill ist wiederholbar", async () => {
    const course = await setup();
    const counts = await backfillExplanations(course.certId, generator);
    expect(counts).toMatchObject({ objectives: 1, created: 2, failed: 0 });
    expect((await backfillExplanations(course.certId, generator)).created).toBe(0);

    // Entwürfe sind nie sichtbar
    expect(await approvedExplanationForQuestion(course.questionIds[0], "detected")).toBeNull();
    const drafts = await listDraftExplanations(course.certId);
    expect(drafts.map((d) => d.kind).sort()).toEqual(["analogy", "worked_example"]);
    expect(await explanationCounts(course.certId)).toEqual({ draft: 2, approved: 0, rejected: 0 });

    const reviewer = await seedUser();
    const worked = drafts.find((d) => d.kind === "worked_example")!;
    const analogy = drafts.find((d) => d.kind === "analogy")!;
    await reviewExplanation({ id: worked.id, reviewerUserId: reviewer, decision: "approved", content: { de: "Überarbeitet: erst die Adresse lesen.", en: "Edited: read the address first." } });
    expect((await approvedExplanationForQuestion(course.questionIds[0], "detected"))?.content.de).toBe("Überarbeitet: erst die Adresse lesen.");
    // nur eine freigegeben: bleibt auch nach einer falschen Aufgabe dieselbe
    expect((await approvedExplanationForQuestion(course.questionIds[0], "in_progress"))?.kind).toBe("worked_example");

    await reviewExplanation({ id: analogy.id, reviewerUserId: reviewer, decision: "approved" });
    expect((await approvedExplanationForQuestion(course.questionIds[0], "detected"))?.kind).toBe("worked_example");
    expect((await approvedExplanationForQuestion(course.questionIds[0], "in_progress"))?.kind).toBe("analogy");
    expect(await explanationCounts(course.certId)).toEqual({ draft: 0, approved: 2, rejected: 0 });
    // eine Entscheidung ist endgültig
    await expect(reviewExplanation({ id: worked.id, reviewerUserId: reviewer, decision: "rejected" })).rejects.toBeInstanceOf(ExplanationNotFoundError);
  });

  it("verworfene Erklärungen werden nie gezeigt und nicht neu erzeugt; ungeeignete KI-Texte werden abgelehnt", async () => {
    const course = await setup();
    await backfillExplanations(course.certId, generator);
    const reviewer = await seedUser();
    for (const d of await listDraftExplanations(course.certId)) await reviewExplanation({ id: d.id, reviewerUserId: reviewer, decision: "rejected" });
    expect(await approvedExplanationForQuestion(course.questionIds[0], "detected")).toBeNull();
    expect((await backfillExplanations(course.certId, generator)).created).toBe(0);

    const other = await setup();
    const bad: ExplanationGenerator = async (_s, kinds) => kinds.map((kind) => ({ kind, content: { de: "zu kurz", en: "too short" } }));
    expect(await backfillExplanations(other.certId, bad)).toMatchObject({ created: 0, rejected: 2 });
    expect(await getDb().select().from(objectiveExplanations).where(eq(objectiveExplanations.objectiveId, other.objectiveId))).toHaveLength(0);
  });
});
