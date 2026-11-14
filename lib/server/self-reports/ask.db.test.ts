/** Aufgabe 18 (Review 12.11.2026): wann welche freiwillige Frage dran ist (nur mit TEST_DATABASE_URL). */
import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

vi.mock("@/lib/server/auth-guards", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { examPlans, lessonCompletions, studySessions } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { GET } from "@/app/api/self-reports/next/route";
import { ENVIRONMENT_INTERVAL_MS, EXAM_CONFIDENCE_INTERVAL_MS, LESSON_QUESTION_INTERVAL_MS, nextSelfReportQuestion } from "./ask";
import { recordSelfReport, setSelfReportEnabled } from "./service";

const run = TEST_DB ? describe : describe.skip;
const DAY = 86_400_000;

afterEach(() => {
  vi.unstubAllEnvs();
});

async function lessonSetup() {
  const course = await seedCourse(1);
  const sectionIds = await seedLessons(course.objectiveId, ["a", "b", "c"]);
  return { course, sectionIds, userId: await seedUser() };
}

run("welche Frage ist dran (echte DB)", () => {
  describe("nach einer Lektion (5.1 und 5.2)", () => {
    it("fragt 5.1 und 5.2 im Wechsel, angefangen mit 5.1, je Lektion nur einmal", async () => {
      const { sectionIds, userId } = await lessonSetup();
      const t0 = new Date();
      const first = await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[0] }, t0);
      expect(first).toEqual({ kind: "effort", refType: "section", refId: sectionIds[0] });
      await recordSelfReport(userId, { kind: "effort", value: 3, refType: "section", refId: sectionIds[0] }, t0);

      // Dieselbe Lektion noch einmal: nicht noch einmal fragen, auch nicht nach einem Tag.
      const later = new Date(t0.getTime() + 2 * LESSON_QUESTION_INTERVAL_MS);
      expect(await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[0] }, later)).toBeNull();
      // Eine andere Lektion: nach 5.1 kommt 5.2.
      expect(await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[1] }, later)).toEqual({ kind: "retention_forecast", refType: "section", refId: sectionIds[1] });
      await recordSelfReport(userId, { kind: "retention_forecast", value: 50, refType: "section", refId: sectionIds[1] }, later);
      const much = new Date(later.getTime() + 2 * LESSON_QUESTION_INTERVAL_MS);
      expect((await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[2] }, much))?.kind).toBe("effort");
    });

    it("höchstens eine Frage nach einer Lektion je Tag", async () => {
      const { sectionIds, userId } = await lessonSetup();
      const t0 = new Date();
      await recordSelfReport(userId, { kind: "effort", value: 2, refType: "section", refId: sectionIds[0] }, t0);
      expect(await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[1] }, new Date(t0.getTime() + LESSON_QUESTION_INTERVAL_MS - 60_000))).toBeNull();
      expect(await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[1] }, new Date(t0.getTime() + LESSON_QUESTION_INTERVAL_MS + 60_000))).not.toBeNull();
    });

    it("eine übersprungene Frage zählt als gefragt, und die abgeschaltete Art wird ausgelassen", async () => {
      const { sectionIds, userId } = await lessonSetup();
      const t0 = new Date();
      await recordSelfReport(userId, { kind: "effort", value: null, refType: "section", refId: sectionIds[0] }, t0);
      expect(await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[0] }, new Date(t0.getTime() + 5 * DAY))).toBeNull();

      await setSelfReportEnabled(userId, "retention_forecast", false);
      // 5.2 wäre dran, ist aber abgeschaltet: dann 5.1.
      expect((await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[1] }, new Date(t0.getTime() + 5 * DAY)))?.kind).toBe("effort");
      await setSelfReportEnabled(userId, "effort", false);
      expect(await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[1] }, new Date(t0.getTime() + 5 * DAY))).toBeNull();
    });

    it("nach dreimaligem Überspringen erscheint die Frage 30 Tage nicht", async () => {
      const { sectionIds, userId } = await lessonSetup();
      await setSelfReportEnabled(userId, "retention_forecast", false);
      const t0 = new Date();
      for (let i = 0; i < 3; i++) await recordSelfReport(userId, { kind: "effort", value: null, refType: "section", refId: crypto.randomUUID() }, new Date(t0.getTime() + i * 2 * DAY));
      const after = new Date(t0.getTime() + 10 * DAY);
      expect(await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[0] }, after)).toBeNull();
      expect(await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[0] }, new Date(t0.getTime() + 40 * DAY))).not.toBeNull();
    });

    it("Kontrollgruppe: ohne das Flag wird nicht gefragt", async () => {
      const { sectionIds, userId } = await lessonSetup();
      vi.stubEnv("FEATURE_SELF_REPORTS", "0");
      expect(await nextSelfReportQuestion(userId, { context: "lesson", sectionId: sectionIds[0] })).toBeNull();
      expect(await nextSelfReportQuestion(userId, { context: "course", certificationId: crypto.randomUUID() })).toBeNull();
      expect(await nextSelfReportQuestion(userId, { context: "checkin" })).toBeNull();
    });
  });

  describe("auf der Kursseite (5.4 und 5.3)", () => {
    it("5.4 einmal je Kurs, nur solange noch keine Lektion abgeschlossen ist", async () => {
      const { course, sectionIds, userId } = await lessonSetup();
      expect(await nextSelfReportQuestion(userId, { context: "course", certificationId: course.certId })).toEqual({ kind: "learning_reason", refType: "course", refId: course.certId });
      await recordSelfReport(userId, { kind: "learning_reason", value: "job", refType: "course", refId: course.certId });
      expect(await nextSelfReportQuestion(userId, { context: "course", certificationId: course.certId })).toBeNull();

      // Ein anderer Kurs, in dem schon gelernt wurde: nicht mehr am Anfang.
      const other = await seedCourse(1);
      const [section] = await seedLessons(other.objectiveId, ["x"]);
      await getDb().insert(lessonCompletions).values({ userId, sectionId: section, completedAt: new Date() });
      expect(await nextSelfReportQuestion(userId, { context: "course", certificationId: other.certId })).toBeNull();
      void sectionIds;
    });

    it("5.3 wöchentlich, solange ein Prüfungstermin in der Zukunft liegt", async () => {
      const { course, userId } = await lessonSetup();
      const t0 = new Date();
      await recordSelfReport(userId, { kind: "learning_reason", value: "interest", refType: "course", refId: course.certId }, t0);
      // Ohne Termin: nichts.
      expect(await nextSelfReportQuestion(userId, { context: "course", certificationId: course.certId }, t0)).toBeNull();
      await getDb().insert(examPlans).values({ userId, certificationId: course.certId, scheduledAt: new Date(t0.getTime() + 20 * DAY), status: "planned" });
      expect(await nextSelfReportQuestion(userId, { context: "course", certificationId: course.certId }, t0)).toEqual({ kind: "exam_confidence", refType: "course", refId: course.certId });
      await recordSelfReport(userId, { kind: "exam_confidence", value: 75, refType: "course", refId: course.certId }, t0);
      expect(await nextSelfReportQuestion(userId, { context: "course", certificationId: course.certId }, new Date(t0.getTime() + EXAM_CONFIDENCE_INTERVAL_MS - 60_000))).toBeNull();
      expect((await nextSelfReportQuestion(userId, { context: "course", certificationId: course.certId }, new Date(t0.getTime() + EXAM_CONFIDENCE_INTERVAL_MS + 60_000)))?.kind).toBe("exam_confidence");
      // Nach dem Termin: nichts mehr.
      expect(await nextSelfReportQuestion(userId, { context: "course", certificationId: course.certId }, new Date(t0.getTime() + 30 * DAY))).toBeNull();
    });
  });

  describe("im Check-in (5.6)", () => {
    it("höchstens einmal je Tag und höchstens eine Frage je Sitzung", async () => {
      const { course, userId } = await lessonSetup();
      const t0 = new Date();
      expect(await nextSelfReportQuestion(userId, { context: "checkin" }, t0)).toEqual({ kind: "learning_environment", refType: "session", refId: null });
      const [session] = await getDb().insert(studySessions).values({ userId, certificationId: course.certId, status: "in_progress", goalType: "questions", goalValue: 1 }).returning();
      await recordSelfReport(userId, { kind: "learning_environment", value: "on_the_go", refType: "session", refId: session.id, sessionId: session.id }, t0);
      expect(await nextSelfReportQuestion(userId, { context: "checkin" }, new Date(t0.getTime() + ENVIRONMENT_INTERVAL_MS - 60_000))).toBeNull();
      expect(await nextSelfReportQuestion(userId, { context: "checkin" }, new Date(t0.getTime() + ENVIRONMENT_INTERVAL_MS + 60_000))).not.toBeNull();
      // Eine weitere Frage in derselben Sitzung wäre abgelehnt (Aufgabe 17).
      expect(await nextSelfReportQuestion(userId, { context: "checkin", sessionId: session.id }, new Date(t0.getTime() + 2 * DAY))).toBeNull();
    });
  });

  describe("GET /api/self-reports/next", () => {
    const call = (query: string) => GET(new Request(`http://x/api/self-reports/next?${query}`));

    it("liefert die Frage oder null und prüft die Eingabe", async () => {
      const { course, sectionIds, userId } = await lessonSetup();
      vi.mocked(getCurrentUser).mockResolvedValue({ id: userId, role: "learner" } as never);
      const lesson = await call(`context=lesson&refId=${sectionIds[0]}`);
      expect((await lesson.json()).question).toMatchObject({ kind: "effort", refId: sectionIds[0] });
      const courseRes = await call(`context=course&refId=${course.certId}`);
      expect((await courseRes.json()).question).toMatchObject({ kind: "learning_reason" });
      expect((await call("context=lesson&refId=keine-uuid")).status).toBe(400);
      expect((await call("context=checkin&refId=" + sectionIds[0])).status).toBe(400);
      vi.mocked(getCurrentUser).mockResolvedValue(null as never);
      expect((await call(`context=lesson&refId=${sectionIds[0]}`)).status).toBe(401);
    });
  });
});
