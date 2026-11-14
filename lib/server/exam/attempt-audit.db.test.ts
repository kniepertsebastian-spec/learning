/** Aufgabe 05b: bestehende Prüfungsversuche nachrechnen (nur lesen). DB-Teil nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { examAnswers, examAttempts, examQuestions, exams, questionOptions, userCertificates, userSkills } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { classifyAttempt, loadAttemptAuditRows, summarizeAttemptAudit } from "./attempt-audit";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });
const DAY = 86_400_000;

describe("classifyAttempt", () => {
  it("rechnet gegen alle Prüfungsfragen", () => {
    expect(classifyAttempt({ total: 10, answers: 1, correctValid: 1, mark: 70 })).toBe("suspicious");
    expect(classifyAttempt({ total: 10, answers: 10, correctValid: 7, mark: 70 })).toBe("ok");
    expect(classifyAttempt({ total: 10, answers: 0, correctValid: 0, mark: 70 })).toBe("unverifiable");
    expect(classifyAttempt({ total: 0, answers: 1, correctValid: 0, mark: 70 })).toBe("suspicious");
  });
});

run("Prüfungsversuche nachrechnen (echte DB)", () => {
  it("findet manipulierte Abgaben, trennt nicht nachrechenbare und schätzt Statistik und Skills", async () => {
    const db = getDb();
    const course = await seedCourse(5);
    const right = await Promise.all(
      course.questionIds.map(async (questionId) => {
        const [r] = await db.insert(questionOptions).values([{ questionId, orderNum: 1, text: t("R"), isCorrect: true }, { questionId, orderNum: 2, text: t("F"), isCorrect: false }]).returning();
        return r.id;
      }),
    );
    const examQs = course.questionIds.slice(0, 4);
    const foreignQ = course.questionIds[4];
    const [exam] = await db.insert(exams).values({ certificationId: course.certId, blueprint: {} }).returning();
    await db.insert(examQuestions).values(examQs.map((questionId, i) => ({ examId: exam.id, questionId, orderNum: i })));

    async function attempt(userId: string, answered: Array<{ questionId: string; selectedOptionId: string | null; isCorrect: boolean }>, daysAgo: number) {
      const [a] = await db.insert(examAttempts).values({ examId: exam.id, userId, score: "100", passed: true, completedAt: new Date(Date.now() - daysAgo * DAY) }).returning();
      if (answered.length) await db.insert(examAnswers).values(answered.map((x) => ({ examAttemptId: a.id, ...x })));
      return a.id;
    }
    const ok = (i: number) => ({ questionId: examQs[i], selectedOptionId: right[i], isCorrect: true });

    // A: eine einzige richtige Antwort (alte Lücke), erstes Bestehen, Kurs-Skill.
    const a = await seedUser();
    await attempt(a, [ok(0)], 30);
    await db.insert(userSkills).values({ userId: a, kind: "skill", name: `Kurs ${course.tag}`, level: "confident", source: "course", sourceCertificationId: course.certId });
    // B: fremde Frage, doppelt gezählt; später ehrlich bestanden. Skill hängt am ehrlichen Versuch.
    const b = await seedUser();
    await attempt(b, [ok(0), ok(0), { questionId: foreignQ, selectedOptionId: right[4], isCorrect: true }], 20);
    await attempt(b, [ok(0), ok(1), ok(2), ok(3)], 10);
    await db.insert(userSkills).values({ userId: b, kind: "skill", name: `Kurs ${course.tag}`, level: "confident", source: "course", sourceCertificationId: course.certId });
    // C: ehrlich bestanden.
    const c = await seedUser();
    await attempt(c, [ok(0), ok(1), ok(2), { questionId: examQs[3], selectedOptionId: null, isCorrect: false }], 5);
    // D: alter Versuch ohne gespeicherte Antworten; E: verdächtig, aber mit Bescheinigung (Skill bleibt außen vor).
    const d = await seedUser();
    await attempt(d, [], 40);
    const e = await seedUser();
    await attempt(e, [ok(0)], 2);
    await db.insert(userSkills).values({ userId: e, kind: "skill", name: `Kurs ${course.tag}`, level: "confident", source: "course", sourceCertificationId: course.certId });
    await db.insert(userCertificates).values({ userId: e, certificationId: course.certId, title: "Z", earnedAt: new Date() });

    const mine = new Set([a, b, c, d, e]);
    const rows = (await loadAttemptAuditRows()).filter((r) => mine.has(r.userId));
    const report = summarizeAttemptAudit(rows);
    expect(report.passedAttempts).toBe(6);
    expect(report.suspicious.count).toBe(3); // A, B (erster), E
    expect(report.incomplete.count).toBe(3);
    expect(report.unverifiable.count).toBe(1);
    expect(report.people).toBe(3);
    expect(report.completionEvents.count).toBe(3); // jeweils das erste Bestehen von A, B und E
    expect(report.courseSkills).toBe(1); // nur A
    expect(report.suspicious.from).toBe(new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10));
    expect(report.suspicious.to).toBe(new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10));
  });
});
