/**
 * Interne Lernpfade mit Schaltern „Lektionstests“ / „Abschlussprüfung“ und den Erzeugungsmodi (anwendungsnahe Fragen,
 * Stichwortliste) gegen eine ECHTE Postgres-Datenbank (nur mit TEST_DATABASE_URL), KI durch Fake-Provider ersetzt.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyDocumentFiles,
  companyDocuments,
  courseGenerationJobs,
  domains,
  objectives,
  organizationAiSettings,
  organizationMemberships,
  organizations,
  questions,
  users,
} from "@/lib/server/db/schema";
import { createFakeBlueprintProvider, createFakeContentProvider } from "@/lib/server/course-generation/fake-providers";
import type { BlueprintGenerationInput, ObjectiveGenerationInput } from "@/lib/server/course-generation/providers";
import { getCourseGenerationJob } from "@/lib/server/course-generation/job-service";
import { executeCourseGenerationJob } from "@/lib/server/course-generation/worker";
import type { CourseBlueprintV1, ObjectiveContentResponse } from "@/lib/server/course-generation/schemas";
import { POST as startRoute } from "@/app/api/internal-courses/route";
import { startInternalCourse } from "./service";

const run = TEST_DB ? describe : describe.skip;

function blueprint(): Omit<CourseBlueprintV1, "requestId"> {
  return {
    schemaVersion: "1.0", title: "VLANs", description: "Test", language: "de", provider: "Intern",
    examQuestionCount: null, examDurationMinutes: null, passingScore: null, scoreScale: null,
    sources: [{ id: "doc-1", title: "Doku", url: "dokument:x", retrievedAt: new Date().toISOString() }],
    domains: [{ id: "dom-1", title: "Grundlagen", weight: 1, objectives: [{
      id: "obj-1", code: "1.1", title: "VLAN", description: "Beschreibung", examWeight: 1, complexity: "medium",
      requiredConcepts: ["vlan"], commonMisconceptions: [], lessonPlan: ["Schritt 1"], sourceLocators: ["Abschnitt 1"],
      recommendedQuestions: 4, requiredScenarios: [],
    }] }],
  };
}
const lessonOnly: ObjectiveContentResponse = {
  sections: [{
    title: { de: "VLAN", en: "VLAN" }, estimatedMinutes: 15, difficulty: "beginner",
    content: { de: "Ein vlan trennt Broadcast-Domänen.", en: "A vlan separates broadcast domains." },
    keyTakeaways: { de: ["a", "b"], en: ["a", "b"] }, examFocusPoints: { de: ["a", "b"], en: ["a", "b"] },
  }],
  questions: [],
};
const withQuestions: ObjectiveContentResponse = {
  ...lessonOnly,
  questions: Array.from({ length: 4 }, (_, i) => ({
    difficulty: "beginner" as const, type: "knowledge" as const,
    question: { de: `Frage ${i + 1} zu vlan?`, en: `Question ${i + 1} about vlan?` },
    options: ["Richtig", "F1", "F2", "F3"].map((t, idx) => ({ text: { de: t, en: t }, isCorrect: idx === i % 4 })),
    explanation: { de: "Erklärung vlan.", en: "Explanation vlan." }, sourceLocator: "Abschnitt 1",
  })),
};

const PROSE = Array.from({ length: 8 }, (_, i) => `Absatz ${i + 1}: Ein VLAN trennt einen Switch logisch in mehrere Broadcast-Domänen, sodass nur Geräte desselben VLANs direkt kommunizieren.`).join("\n");
const KEYWORDS = ["VLAN", "Access-Port", "Trunk-Port", "Native VLAN", "802.1Q", "Inter-VLAN-Routing", "SVI", "Router-on-a-stick", "Voice VLAN", "Management VLAN"].join("\n");

run("Interne Lernpfade: Tests ein/aus und Erzeugungsmodi (echte DB, Fake-KI)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids = { orgs: [] as string[], users: [] as string[] };
  let orgA = "";
  let userId = "";
  let docProse = "";
  let docKeywords = "";
  const seen: { blueprint: BlueprintGenerationInput[]; objective: ObjectiveGenerationInput[] } = { blueprint: [], objective: [] };

  async function mkDoc(title: string, text: string) {
    const [d] = await getDb().insert(companyDocuments).values({ organizationId: orgA, title, originalFilename: `${title}.txt`, mimeType: "text/plain", sizeBytes: text.length, checksum: randomUUID(), pageCount: 1 }).returning();
    await getDb().insert(companyDocumentFiles).values({ documentId: d.id, data: Buffer.from(text, "utf-8") });
    return d.id;
  }
  async function generate(documentId: string, flags: { includeSectionQuizzes?: boolean; includeFinalExam?: boolean }, content: ObjectiveContentResponse) {
    seen.blueprint.length = 0;
    seen.objective.length = 0;
    const { jobId } = await startInternalCourse({ organizationId: orgA, userId, documentId, title: `Kurs ${randomUUID().slice(0, 6)}`, language: "de", startWorker: false, ...flags });
    const bp = createFakeBlueprintProvider(blueprint());
    const blueprintProvider = { ...bp, async generateBlueprint(input: BlueprintGenerationInput, onUsage: Parameters<typeof bp.generateBlueprint>[1]) { seen.blueprint.push(input); return bp.generateBlueprint(input, onUsage); } };
    const base = createFakeContentProvider("fake", { "obj-1": { result: content } });
    const contentProvider = { ...base, async generateObjective(input: ObjectiveGenerationInput, onUsage: Parameters<typeof base.generateObjective>[1]) { seen.objective.push(input); return base.generateObjective(input, onUsage); } };
    await executeCourseGenerationJob(jobId, { blueprintProvider, contentProvider, repairProvider: contentProvider });
    return (await getCourseGenerationJob(jobId))!;
  }
  const certOf = async (job: { resultCertificationId: string | null }) => (await getDb().select().from(certifications).where(eq(certifications.id, job.resultCertificationId!)))[0];
  const questionCount = async (certId: string) =>
    (await getDb().select({ id: questions.id }).from(questions).innerJoin(objectives, eq(objectives.id, questions.objectiveId)).innerJoin(domains, eq(domains.id, objectives.domainId)).where(eq(domains.certificationId, certId))).length;

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = "test-platform-key";
    orgA = (await getDb().insert(organizations).values({ name: `TestOpt ${tag}` }).returning())[0].id;
    ids.orgs.push(orgA);
    const [u] = await getDb().insert(users).values({ email: `tester-${tag}@test.example`, passwordHash: "x", name: "Tester" }).returning({ id: users.id });
    userId = u.id;
    ids.users.push(u.id);
    await getDb().insert(organizationMemberships).values({ organizationId: orgA, userId, role: "mentor" });
    await getDb().insert(organizationAiSettings).values({ organizationId: orgA, mode: "platform" });
    docProse = await mkDoc("Fließtext", PROSE);
    docKeywords = await mkDoc("Stichworte", KEYWORDS);
  });
  afterAll(async () => {
    await getDb().delete(courseGenerationJobs).where(inArray(courseGenerationJobs.organizationId, ids.orgs));
    await getDb().delete(certifications).where(inArray(certifications.ownerOrganizationId, ids.orgs));
    await getDb().delete(organizations).where(inArray(organizations.id, ids.orgs));
    await getDb().delete(users).where(inArray(users.id, ids.users));
  });

  it("Standard: Lektionstests und Abschlussprüfung an, Fragen werden erzeugt, anwendungsnahe Fragen, kein Stichwortmodus", async () => {
    const job = await generate(docProse, {}, withQuestions);
    expect(job.status, `${job.errorCode}: ${job.errorMessage}`).toBe("published");
    expect(job).toMatchObject({ includeSectionQuizzes: true, includeFinalExam: true });
    expect(await certOf(job)).toMatchObject({ includeSectionQuizzes: true, includeFinalExam: true, kind: "internal" });
    expect(await questionCount(job.resultCertificationId!)).toBe(4);
    expect(seen.objective[0]).toMatchObject({ withQuestions: true, practical: true, outline: false });
    expect(seen.blueprint[0].outline).toBe(false);
  });

  it("beides aus: reiner Durchlauf, nur Lektionen, keine Fragen, günstiger", async () => {
    const job = await generate(docProse, { includeSectionQuizzes: false, includeFinalExam: false }, lessonOnly);
    expect(job.status, `${job.errorCode}: ${job.errorMessage}`).toBe("published");
    expect(await certOf(job)).toMatchObject({ includeSectionQuizzes: false, includeFinalExam: false });
    expect(await questionCount(job.resultCertificationId!)).toBe(0);
    expect(seen.objective[0].withQuestions).toBe(false);
  });

  it("nur Abschlussprüfung oder nur Lektionstests: Fragen werden erzeugt (die Prüfung zieht aus demselben Pool)", async () => {
    const examOnly = await generate(docProse, { includeSectionQuizzes: false, includeFinalExam: true }, withQuestions);
    expect(examOnly.status, `${examOnly.errorCode}: ${examOnly.errorMessage}`).toBe("published");
    expect(await certOf(examOnly)).toMatchObject({ includeSectionQuizzes: false, includeFinalExam: true });
    expect(seen.objective[0].withQuestions).toBe(true);
    expect(await questionCount(examOnly.resultCertificationId!)).toBe(4);
    const quizOnly = await generate(docProse, { includeSectionQuizzes: true, includeFinalExam: false }, withQuestions);
    expect(await certOf(quizOnly)).toMatchObject({ includeSectionQuizzes: true, includeFinalExam: false });
    expect(await questionCount(quizOnly.resultCertificationId!)).toBe(4);
  });

  it("ohne Fragen angefordert, aber die KI liefert trotzdem welche: sie werden übernommen (kein Fehler) und stören nichts", async () => {
    const job = await generate(docProse, { includeSectionQuizzes: false, includeFinalExam: false }, withQuestions);
    expect(job.status, `${job.errorCode}: ${job.errorMessage}`).toBe("published");
  });

  it("mit Fragen angefordert, aber keine geliefert: der Auftrag scheitert (Reparatur, dann Abbruch)", async () => {
    const job = await generate(docProse, {}, lessonOnly);
    expect(job.status).not.toBe("published");
  });

  it("Stichwortliste wird erkannt: Blueprint und Inhalte bekommen den Stichwortmodus, der Auftrag weist darauf hin", async () => {
    const job = await generate(docKeywords, {}, withQuestions);
    expect(job.status, `${job.errorCode}: ${job.errorMessage}`).toBe("published");
    expect(seen.blueprint[0].outline).toBe(true);
    expect(seen.objective[0].outline).toBe(true);
  });

  it("Regression: interne Lernpfade mit gleichem Titel und gleichen Lernziel-Codes erzeugen eindeutige Frage-IDs", async () => {
    const title = `Netzwerk ${randomUUID().slice(0, 6)}`;
    const make = async () => {
      const { jobId } = await startInternalCourse({ organizationId: orgA, userId, documentId: docProse, title, language: "de", startWorker: false });
      const bp = createFakeBlueprintProvider(blueprint());
      const content = createFakeContentProvider("fake", { "obj-1": { result: withQuestions } });
      await executeCourseGenerationJob(jobId, { blueprintProvider: bp, contentProvider: content, repairProvider: content });
      return (await getCourseGenerationJob(jobId))!;
    };
    const first = await make();
    // der erste ist noch ein Entwurf: der Auftrag für denselben Titel läuft nicht mehr, ein zweiter ist erlaubt
    const second = await make();
    expect(first.status, String(first.errorMessage)).toBe("published");
    expect(second.status, String(second.errorMessage)).toBe("published");
    const ids = await getDb()
      .select({ humanId: questions.humanId })
      .from(questions)
      .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(inArray(domains.certificationId, [first.resultCertificationId!, second.resultCertificationId!]));
    expect(ids).toHaveLength(8);
    expect(new Set(ids.map((i) => i.humanId)).size).toBe(8);
    expect(ids.every((i) => /^I[0-9A-F]{8}-1\.1-Q\d{3}$/.test(i.humanId))).toBe(true);
  });

  it("Route: Schalter werden angenommen, Standard bleibt an, falsche Typen 400", async () => {
    authMock.mockResolvedValue({ user: { id: userId } });
    const post = (body: unknown) => startRoute(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    expect((await post({ documentId: docProse, title: "Ohne Tests", includeSectionQuizzes: "nein" })).status).toBe(400);
    const res = await post({ documentId: docProse, title: "Ohne Tests A", includeSectionQuizzes: false, includeFinalExam: false });
    expect(res.status).toBe(202);
    const [job] = await getDb().select().from(courseGenerationJobs).where(eq(courseGenerationJobs.id, (await res.json()).jobId));
    expect(job).toMatchObject({ includeSectionQuizzes: false, includeFinalExam: false });
    const def = await post({ documentId: docProse, title: "Standard A" });
    const [job2] = await getDb().select().from(courseGenerationJobs).where(eq(courseGenerationJobs.id, (await def.json()).jobId));
    expect(job2).toMatchObject({ includeSectionQuizzes: true, includeFinalExam: true });
  });
});
