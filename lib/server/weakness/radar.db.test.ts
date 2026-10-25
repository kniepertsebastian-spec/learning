/** Schwächen-Radar gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { objectives, questionOptions } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { recordChapterQuizAttempt } from "@/lib/server/sections/attempt-service";
import { getWeaknessRadar } from "./radar";

const run = TEST_DB ? describe : describe.skip;

run("Schwächen-Radar (echte DB)", () => {
  it("zählt aus den Kapitel-Quizzes die zuletzt falsch beantworteten Fragen je Thema; später richtig = nicht mehr schwach", async () => {
    const course = await seedCourse(3);
    const options = new Map<string, { right: string; wrong: string }>();
    for (const questionId of course.questionIds) {
      const [right] = await getDb().insert(questionOptions).values({ questionId, text: { de: "r", en: "r" }, isCorrect: true, orderNum: 1 }).returning({ id: questionOptions.id });
      const [wrong] = await getDb().insert(questionOptions).values({ questionId, text: { de: "f", en: "w" }, isCorrect: false, orderNum: 2 }).returning({ id: questionOptions.id });
      options.set(questionId, { right: right.id, wrong: wrong.id });
    }
    const [{ domainId }] = await getDb().select({ domainId: objectives.domainId }).from(objectives).where(eq(objectives.id, course.objectiveId));
    const userId = await seedUser();

    // ohne Antworten: kein Radar
    expect(await getWeaknessRadar(userId, course.certId)).toEqual({ topics: [], hasData: false });

    // Erster Versuch: zwei falsch, eine richtig
    const [q1, q2, q3] = course.questionIds;
    await recordChapterQuizAttempt(userId, domainId, [
      { questionId: q1, selectedOptionId: options.get(q1)!.wrong },
      { questionId: q2, selectedOptionId: options.get(q2)!.wrong },
      { questionId: q3, selectedOptionId: options.get(q3)!.right },
    ]);
    let radar = await getWeaknessRadar(userId, course.certId);
    expect(radar.hasData).toBe(true);
    expect(radar.topics).toHaveLength(1);
    expect(radar.topics[0]).toMatchObject({ objectiveId: course.objectiveId, wrong: 2, answered: 3 });

    // Zweiter Versuch: q1 jetzt richtig, q2 weiter falsch → nur noch eine Frage schwach
    await recordChapterQuizAttempt(userId, domainId, [
      { questionId: q1, selectedOptionId: options.get(q1)!.right },
      { questionId: q2, selectedOptionId: options.get(q2)!.wrong },
    ]);
    radar = await getWeaknessRadar(userId, course.certId);
    expect(radar.topics[0]).toMatchObject({ wrong: 1, answered: 3 });

    // Alles richtig: keine Schwäche, aber Daten sind da
    await recordChapterQuizAttempt(userId, domainId, [{ questionId: q2, selectedOptionId: options.get(q2)!.right }]);
    expect(await getWeaknessRadar(userId, course.certId)).toMatchObject({ topics: [], hasData: true });

    // andere Person und anderer Kurs sehen nichts davon
    expect(await getWeaknessRadar(await seedUser(), course.certId)).toEqual({ topics: [], hasData: false });
    expect(await getWeaknessRadar(userId, (await seedCourse(1)).certId)).toEqual({ topics: [], hasData: false });
  });
});
