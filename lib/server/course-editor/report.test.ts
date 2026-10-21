/** Qualitätsbericht und Abdeckung (echte DB nur mit TEST_DATABASE_URL, Quellenabruf ersetzt). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, contentReports, courseGenerationJobs, domains, examAnswers, examAttempts, exams, lessons, objectives, questionOptions, questions, quizAnswers, sections, users } from "@/lib/server/db/schema";
import { buildSourceReport } from "@/lib/server/course-generation/coverage";
import type { FetchedSource } from "@/lib/server/course-generation/sources";
import { acceptSourceBaseline, CoverageRefreshError, getCourseReport, refreshCoverage } from "./report";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);

const source = (text: string, truncated = false): FetchedSource => ({ id: "s", title: "Prüfungsleitfaden", url: "https://example.org/guide.pdf", retrievedAt: new Date().toISOString(), excerpts: [{ locator: "S. 1", text }], truncated });
const GUIDE = ["1.1 Plan the architecture", "1.2 Operate the system", "2.1 Secure the network", "2.2 Monitor everything", "Objective 3.1 Troubleshoot problems"].join("\n");

describe("Quellenbericht", () => {
  it("erkennt Lernziele und gekürzte Quellen, ignoriert Bildbeschreibungen", () => {
    const withImage = source(GUIDE, true);
    withImage.excerpts.push({ locator: "Bild: x.png", text: "9.9 Erfundenes Lernziel aus einer Bildbeschreibung" });
    const r = buildSourceReport([withImage], new Date("2026-10-20T10:00:00Z"));
    expect(r.officialObjectives.map((o) => o.code)).toEqual(["1.1", "1.2", "2.1", "2.2", "3.1"]);
    expect(r.truncated).toEqual([{ title: "Prüfungsleitfaden", url: "https://example.org/guide.pdf" }]);
    expect(r.checkedAt).toBe("2026-10-20T10:00:00.000Z");
  });
});

run("Qualitätsbericht (echte DB)", () => {
  const certIds: string[] = [];
  const userIds: string[] = [];
  afterAll(async () => {
    const db = getDb();
    if (certIds.length) await db.delete(certifications).where(inArray(certifications.id, certIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  });

  async function mk(opts: { lessonText: string; questionCount: number; jobSources?: string[]; recommended?: number }) {
    const d = getDb();
    const [c] = await d.insert(certifications).values({ slug: `rp-${certIds.length}-${tag}`, name: "R", provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id });
    certIds.push(c.id);
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "Domain 1" }).returning();
    const [o11] = await d.insert(objectives).values({ domainId: dom.id, code: "1.1", title: "Plan" }).returning();
    await d.insert(objectives).values({ domainId: dom.id, code: "1.2", title: "Operate" });
    const [sec] = await d.insert(sections).values({ objectiveId: o11.id, orderNum: 1, title: { de: "Planen", en: "Plan" } }).returning();
    const [les] = await d.insert(lessons).values({ sectionId: sec.id, content: { de: opts.lessonText, en: opts.lessonText } }).returning();
    const qs: string[] = [];
    for (let i = 0; i < opts.questionCount; i++) {
      const [q] = await d.insert(questions).values({ humanId: `RP${tag}${certIds.length}-1.1-Q${i}`, objectiveId: o11.id, difficulty: "beginner", type: "knowledge", question: { de: "F", en: "Q" }, explanation: { de: "E", en: "E" } }).returning();
      await d.insert(questionOptions).values([{ questionId: q.id, orderNum: 1, text: { de: "a", en: "a" }, isCorrect: true }, { questionId: q.id, orderNum: 2, text: { de: "b", en: "b" }, isCorrect: false }]);
      qs.push(q.id);
    }
    if (opts.jobSources) {
      await d.insert(courseGenerationJobs).values({
        courseTitle: "R",
        courseDescription: "R",
        language: "de",
        provider: "T",
        sourceUrls: opts.jobSources,
        initialCostLimitUsd: "1",
        absoluteCostLimitUsd: "2",
        blueprintProvider: "test",
        resultCertificationId: c.id,
        blueprintJson: opts.recommended ? { domains: [{ objectives: [{ code: "1.1", recommendedQuestions: opts.recommended }] }] } : null,
      });
    }
    return { certId: c.id, sectionId: sec.id, lessonId: les.id, questionIds: qs, objectiveId: o11.id };
  }

  it("Struktur, Verbesserungsliste mit Wichtigkeit, Meldungen und schwierige Fragen", async () => {
    const thin = "kurz";
    const { certId, lessonId, questionIds } = await mk({ lessonText: thin, questionCount: 2 });
    const d = getDb();
    const [u] = await d.insert(users).values({ email: `rep-${tag}@example.com`, passwordHash: "x" }).returning({ id: users.id });
    userIds.push(u.id);
    await d.insert(contentReports).values({ reporterUserId: u.id, targetType: "lesson", targetId: lessonId, reason: "incorrect" });
    await d.insert(contentReports).values({ reporterUserId: u.id, targetType: "question", targetId: questionIds[0], reason: "unclear" });
    // Frage 2: 12 Antworten, nur 3 richtig (25 %) → schwierig
    const [exam] = await d.insert(exams).values({ certificationId: certId, blueprint: {} }).returning();
    const [att] = await d.insert(examAttempts).values({ examId: exam.id, userId: u.id }).returning();
    await d.insert(examAnswers).values(Array.from({ length: 12 }, (_, i) => ({ examAttemptId: att.id, questionId: questionIds[1], selectedOptionId: null, isCorrect: i < 3 })));
    void quizAnswers;

    const r = await getCourseReport(certId);
    expect(r.totals).toMatchObject({ domains: 1, objectives: 2, sections: 1, questions: 2, simulations: 0, openReports: 2 });
    expect(r.domains[0]).toMatchObject({ name: "Domain 1", objectives: 2, sections: 1, questions: 2 });
    const kinds = r.improvements.map((i) => `${i.severity}:${i.kind}`);
    expect(kinds.filter((k) => k === "high:open_report")).toHaveLength(2);
    expect(kinds).toContain("medium:hard_question");
    expect(kinds).toContain("low:thin_lesson");
    expect(kinds).toContain("low:no_exam_callout");
    // 1.1 hat 2 Fragen (< 4), 1.2 hat 0
    expect(r.improvements.filter((i) => i.kind === "few_questions").map((i) => i.objectiveCode)).toEqual(["1.1", "1.2"]);
    // sortiert: wichtig vor mittel vor gering
    const order = r.improvements.map((i) => i.severity);
    expect(order).toEqual([...order].sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a] - ({ high: 0, medium: 1, low: 2 })[b]));
    expect(r.coverage.unavailable).toBe("no_job");
  });

  it("empfohlene Fragenzahl aus dem Blueprint, praxisnahe Lektion ohne Simulation, Simulation gezählt", async () => {
    const hands = "> [!EXAM]\n> x\n\n```console\n$ ls\n```\n" + "Text. ".repeat(120);
    const a = await mk({ lessonText: hands, questionCount: 6, jobSources: ["https://example.org/guide.pdf"], recommended: 8 });
    const ra = await getCourseReport(a.certId);
    expect(ra.improvements.find((i) => i.kind === "few_questions" && i.objectiveCode === "1.1")?.text.de).toContain("6 Fragen, empfohlen sind 8");
    expect(ra.improvements.some((i) => i.kind === "hands_on_without_simulation")).toBe(true);
    const sim = hands + "\n```simulation\n{}\n```\n";
    const b = await mk({ lessonText: sim, questionCount: 8, jobSources: ["https://example.org/x"] });
    const rb = await getCourseReport(b.certId);
    expect(rb.totals.simulations).toBe(1);
    expect(rb.improvements.some((i) => i.kind === "hands_on_without_simulation")).toBe(false);
  });

  it("Quelle prüfen: fehlende Lernziele, gekürzte Quelle, nicht abrufbar, kein Auftrag", async () => {
    const { certId } = await mk({ lessonText: "x".repeat(600), questionCount: 4, jobSources: ["https://example.org/guide.pdf"] });
    let r = await getCourseReport(certId);
    expect(r.coverage).toMatchObject({ unavailable: null, checkedAt: null, result: null, canRefresh: true });
    await refreshCoverage(certId, async () => [source(GUIDE, true)]);
    r = await getCourseReport(certId);
    expect(r.coverage.truncated).toHaveLength(1);
    expect(r.coverage.result).toMatchObject({ status: "ok", recognised: 5, covered: ["1.1", "1.2"] });
    expect(r.improvements.filter((i) => i.kind === "missing_objective").map((i) => i.objectiveCode)).toEqual(["2.1", "2.2", "3.1"]);
    expect(r.improvements.find((i) => i.kind === "missing_objective")?.severity).toBe("high");
    await expect(refreshCoverage(certId, async () => { throw new (await import("@/lib/server/course-generation/sources")).SourceFetchError("Zeitüberschreitung"); })).rejects.toBeInstanceOf(CoverageRefreshError);
    const none = await mk({ lessonText: "x", questionCount: 0 });
    await expect(refreshCoverage(none.certId)).rejects.toBeInstanceOf(CoverageRefreshError);
  });

  it("Versionsüberwachung: neue Prüfungsversion und geänderte Lernziele gegen den ersten Stand, bestätigen setzt zurück", async () => {
    const { certId } = await mk({ lessonText: "x".repeat(600), questionCount: 4, jobSources: ["https://example.org/guide.pdf"] });
    const v1 = "Exam SY0-601\n" + GUIDE;
    expect(await refreshCoverage(certId, async () => [{ ...source(v1), primary: true }])).toBeNull();
    expect(await refreshCoverage(certId, async () => [{ ...source(v1), primary: true }])).toBeNull();
    const v2 = "Exam SY0-701\n" + GUIDE.replace("2.2 Monitor everything", "4.1 Automate responses");
    const change = await refreshCoverage(certId, async () => [{ ...source(v2), primary: true }]);
    expect(change).toMatchObject({ textChanged: true, versionsBefore: ["SY0-601"], versionsNow: ["SY0-701"] });
    expect(change!.added.map((o) => o.code)).toEqual(["4.1"]);
    expect(change!.removed.map((o) => o.code)).toEqual(["2.2"]);
    const r = await getCourseReport(certId);
    expect(r.coverage.change?.added).toHaveLength(1);
    const [cert] = await getDb().select({ v: certifications.lastVerifiedDate }).from(certifications).where(eq(certifications.id, certId));
    expect(cert.v).toBeInstanceOf(Date);
    await acceptSourceBaseline(certId);
    expect((await getCourseReport(certId)).coverage.change).toBeNull();
  });
});
