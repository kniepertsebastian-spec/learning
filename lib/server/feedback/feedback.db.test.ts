/** „Problem melden / Feedback“ gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { objectives } from "@/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { FEEDBACK_DAILY_LIMIT, FeedbackInvalidError, FeedbackNotFoundError, FeedbackRateLimitError, listOpenFeedback, resolveFeedback, submitFeedback } from "./service";

const run = TEST_DB ? describe : describe.skip;

run("Problem melden / Feedback (echte DB)", () => {
  async function setup() {
    const course = await seedCourse(1);
    const [sectionId] = await seedLessons(course.objectiveId, ["Text"]);
    const [obj] = await getDb().select({ domainId: objectives.domainId }).from(objectives).where(eq(objectives.id, course.objectiveId));
    return { ...course, sectionId, domainId: obj.domainId };
  }

  it("speichert die Meldung mit Kurs, Kapitel und Lektion; das Kapitel wird aus der Lektion abgeleitet", async () => {
    const c = await setup();
    const userId = await seedUser();
    const { id } = await submitFeedback({ userId, certificationId: c.certId, sectionId: c.sectionId, category: "typo", message: "  Da fehlt ein Buchstabe im zweiten Absatz.  " });
    const open = await listOpenFeedback(c.certId);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ id, category: "typo", message: "Da fehlt ein Buchstabe im zweiten Absatz.", sectionId: c.sectionId, courseSlug: expect.any(String) });
    expect(open[0].domainName).toBeTruthy();
    // ohne Lektion, nur Kapitel; ganz ohne Kontext (Kursübersicht)
    await submitFeedback({ userId, certificationId: c.certId, domainId: c.domainId, category: "content", message: "Das Kapitel widerspricht sich." });
    await submitFeedback({ userId, certificationId: c.certId, category: "bug", message: "Die Seite lädt nicht richtig." });
    expect(await listOpenFeedback(c.certId)).toHaveLength(3);
  });

  it("Kontext muss zum Kurs gehören, zu kurze Texte werden abgelehnt", async () => {
    const a = await setup();
    const b = await setup();
    const userId = await seedUser();
    await expect(submitFeedback({ userId, certificationId: a.certId, sectionId: b.sectionId, category: "bug", message: "Fremde Lektion hier" })).rejects.toBeInstanceOf(FeedbackInvalidError);
    await expect(submitFeedback({ userId, certificationId: a.certId, domainId: b.domainId, category: "bug", message: "Fremdes Kapitel hier" })).rejects.toBeInstanceOf(FeedbackInvalidError);
    await expect(submitFeedback({ userId, certificationId: a.certId, domainId: b.domainId, sectionId: a.sectionId, category: "bug", message: "Kapitel passt nicht dazu" })).rejects.toBeInstanceOf(FeedbackInvalidError);
    await expect(submitFeedback({ userId, certificationId: a.certId, category: "bug", message: "  hi " })).rejects.toBeInstanceOf(FeedbackInvalidError);
    expect(await listOpenFeedback(a.certId)).toHaveLength(0);
  });

  it("begrenzt die Meldungen je Person und Tag", async () => {
    const c = await setup();
    const userId = await seedUser();
    for (let i = 0; i < FEEDBACK_DAILY_LIMIT; i++) await submitFeedback({ userId, certificationId: c.certId, category: "other", message: `Meldung Nummer ${i}` });
    await expect(submitFeedback({ userId, certificationId: c.certId, category: "other", message: "Eine zu viel" })).rejects.toBeInstanceOf(FeedbackRateLimitError);
    // nach 24 Stunden geht es wieder; andere Personen sind nicht betroffen
    await submitFeedback({ userId, certificationId: c.certId, category: "other", message: "Am nächsten Tag" }, new Date(Date.now() + 25 * 3_600_000));
    await submitFeedback({ userId: await seedUser(), certificationId: c.certId, category: "other", message: "Andere Person" });
  });

  it("Abschließen nimmt die Meldung aus der offenen Liste, nur einmal", async () => {
    const c = await setup();
    const userId = await seedUser();
    const { id } = await submitFeedback({ userId, certificationId: c.certId, category: "bug", message: "Bitte ansehen" });
    await resolveFeedback(id, userId, "resolved");
    expect(await listOpenFeedback(c.certId)).toHaveLength(0);
    await expect(resolveFeedback(id, userId, "dismissed")).rejects.toBeInstanceOf(FeedbackNotFoundError);
  });
});
