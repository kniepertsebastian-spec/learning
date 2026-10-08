/**
 * Merkzettel je Lektion: Schema (nachsichtig), Prompt (firmeneigene Namen aus der Quelle), Schutz vor Zugangsdaten und
 * der Weg bis in die Datenbank (echte Postgres, Fake-KI, nur mit TEST_DATABASE_URL).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications, companyDocumentFiles, companyDocuments, courseGenerationJobs, domains, lessons, objectives, organizationAiSettings,
  organizationMemberships, organizations, sections, users,
} from "@/lib/server/db/schema";
import { createFakeBlueprintProvider, createFakeContentProvider } from "./fake-providers";
import { executeCourseGenerationJob } from "./worker";
import { getCourseGenerationJob } from "./job-service";
import { safeCheatSheet } from "./importer";
import { coursePackageSectionSchema, type CourseBlueprintV1, type ObjectiveContentResponse } from "./schemas";
import { createHaikuContentProvider } from "./providers";
import { startInternalCourse } from "@/lib/server/internal-courses/service";

const j = (...p: string[]) => p.join("");
const section = (extra: Record<string, unknown> = {}) => ({
  title: { de: "VLAN", en: "VLAN" }, estimatedMinutes: 15, difficulty: "beginner",
  content: { de: "Ein VLAN trennt Broadcast-Domänen.", en: "A VLAN separates broadcast domains." },
  keyTakeaways: { de: ["a", "b"], en: ["a", "b"] }, examFocusPoints: { de: ["a", "b"], en: ["a", "b"] }, ...extra,
});

describe("Merkzettel: Schema und Schutz (ohne Datenbank)", () => {
  it("gültiger Merkzettel wird übernommen", () => {
    const r = coursePackageSectionSchema.parse(section({ cheatSheet: { de: "- `show vlan`", en: "- `show vlan`" } }));
    expect(r.cheatSheet).toEqual({ de: "- `show vlan`", en: "- `show vlan`" });
  });
  it("fehlt er oder ist er unbrauchbar, scheitert die Lektion nicht, der Merkzettel entfällt", () => {
    for (const bad of [undefined, null, "", { de: "nur deutsch" }, { de: "", en: "" }, 42, ["x"]]) {
      const parsed = coursePackageSectionSchema.safeParse(section(bad === undefined ? {} : { cheatSheet: bad }));
      expect(parsed.success, JSON.stringify(bad)).toBe(true);
      expect(parsed.success && parsed.data.cheatSheet).toBeUndefined();
    }
  });
  it("safeCheatSheet: Zugangsdaten in einer Sprachfassung lassen den ganzen Merkzettel entfallen", () => {
    expect(safeCheatSheet({ de: "- Server: web01", en: "- Server: web01" })).toEqual({ de: "- Server: web01", en: "- Server: web01" });
    expect(safeCheatSheet({ de: "ok", en: j("Key:\n-----BEGIN ", "PRIVATE KEY-----\nabc") })).toBeNull();
    expect(safeCheatSheet({ de: j("-----BEGIN ", "PRIVATE KEY-----\nabc"), en: "ok" })).toBeNull();
    expect(safeCheatSheet(undefined)).toBeNull();
  });
  it("der Prompt verlangt den Merkzettel mit firmeneigenen Namen wörtlich aus der Quelle und ohne Zugangsdaten", async () => {
    let seen = "";
    const client = {
      models: {
        generateContent: async (args: { contents: string }) => {
          seen = args.contents;
          return { text: JSON.stringify({ sections: [section({ cheatSheet: { de: "x", en: "x" } })], questions: [] }), usageMetadata: {} };
        },
      },
    } as unknown as GoogleGenAI;
    const provider = createHaikuContentProvider(client);
    await provider.generateObjective(
      {
        courseTitle: "Betrieb", withQuestions: false, practical: true,
        objective: { id: "o", code: "1.1", title: "T", description: "D", examWeight: 1, complexity: "medium", requiredConcepts: ["a", "b"], commonMisconceptions: [], lessonPlan: ["x"], sourceLocators: [], recommendedQuestions: 4, requiredScenarios: [] },
        domain: { id: "d", title: "D", weight: 1, objectives: [] },
        sourceExcerpts: [{ locator: "Abschnitt 1", text: "Backups laufen auf backup01." }],
      } as never,
      () => undefined,
    );
    expect(seen).toContain("cheatSheet");
    expect(seen).toContain("Servernamen");
    expect(seen).toContain("GENAU so geschrieben wie in der Quelle");
    expect(seen).toMatch(/Nie Passwörter, Schlüssel, Tokens/);
  });
});

const run = TEST_DB ? describe : describe.skip;

function blueprint(): Omit<CourseBlueprintV1, "requestId"> {
  return {
    schemaVersion: "1.0", title: "Betrieb", description: "Test", language: "de", provider: "Intern",
    examQuestionCount: null, examDurationMinutes: null, passingScore: null, scoreScale: null,
    sources: [{ id: "doc-1", title: "Doku", url: "dokument:x", retrievedAt: new Date().toISOString() }],
    domains: [{ id: "dom-1", title: "Grundlagen", weight: 1, objectives: [{
      id: "obj-1", code: "1.1", title: "Backups", description: "Beschreibung", examWeight: 1, complexity: "medium",
      requiredConcepts: ["backup", "restore"], commonMisconceptions: [], lessonPlan: ["Schritt 1"], sourceLocators: ["Abschnitt 1"],
      recommendedQuestions: 4, requiredScenarios: [],
    }] }],
  };
}

run("Merkzettel bis in die Datenbank (echte DB, Fake-KI)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids = { orgs: [] as string[], users: [] as string[] };
  let orgA = "";
  let userId = "";
  let docId = "";

  async function generate(content: ObjectiveContentResponse) {
    const { jobId } = await startInternalCourse({ organizationId: orgA, userId, documentId: docId, title: `Kurs ${randomUUID().slice(0, 6)}`, language: "de", includeSectionQuizzes: false, includeFinalExam: false, startWorker: false });
    const bp = createFakeBlueprintProvider(blueprint());
    const cp = createFakeContentProvider("fake", { "obj-1": { result: content } });
    await executeCourseGenerationJob(jobId, { blueprintProvider: bp, contentProvider: cp, repairProvider: cp });
    return (await getCourseGenerationJob(jobId))!;
  }
  const lessonOf = async (certId: string) =>
    (await getDb().select({ cheatSheet: lessons.cheatSheet }).from(lessons).innerJoin(sections, eq(sections.id, lessons.sectionId)).innerJoin(objectives, eq(objectives.id, sections.objectiveId)).innerJoin(domains, eq(domains.id, objectives.domainId)).where(eq(domains.certificationId, certId)))[0];

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = "test-platform-key";
    orgA = (await getDb().insert(organizations).values({ name: `Merk ${tag}` }).returning())[0].id;
    ids.orgs.push(orgA);
    const [u] = await getDb().insert(users).values({ email: `merk-${tag}@test.example`, passwordHash: "x", name: "T" }).returning({ id: users.id });
    userId = u.id;
    ids.users.push(u.id);
    await getDb().insert(organizationMemberships).values({ organizationId: orgA, userId, role: "mentor" });
    await getDb().insert(organizationAiSettings).values({ organizationId: orgA, mode: "platform" });
    const text = "Backups laufen nachts um 02:00 auf backup01. Restore: restic restore latest.";
    const [d] = await getDb().insert(companyDocuments).values({ organizationId: orgA, title: "Doku", originalFilename: "d.txt", mimeType: "text/plain", sizeBytes: text.length, checksum: randomUUID(), pageCount: 1 }).returning();
    await getDb().insert(companyDocumentFiles).values({ documentId: d.id, data: Buffer.from(text) });
    docId = d.id;
  });
  afterAll(async () => {
    await getDb().delete(courseGenerationJobs).where(inArray(courseGenerationJobs.organizationId, ids.orgs));
    await getDb().delete(certifications).where(inArray(certifications.ownerOrganizationId, ids.orgs));
    await getDb().delete(organizations).where(inArray(organizations.id, ids.orgs));
    await getDb().delete(users).where(inArray(users.id, ids.users));
  });

  const content = (cheatSheet?: unknown): ObjectiveContentResponse =>
    ({
      sections: [section({ content: { de: "Ein backup sichert Daten, ein restore stellt sie wieder her.", en: "A backup saves data, a restore brings it back." }, ...(cheatSheet === undefined ? {} : { cheatSheet }) })],
      questions: [],
    }) as unknown as ObjectiveContentResponse;

  it("der Merkzettel der KI landet an der Lektion (auch firmeneigene Namen)", async () => {
    const sheet = { de: "- Backup: `backup01`, 02:00 Uhr\n```bash\nrestic restore latest\n```", en: "- Backup: `backup01`, 2 a.m." };
    const job = await generate(content(sheet));
    expect(job.status).toBe("published");
    expect((await lessonOf(job.resultCertificationId!)).cheatSheet).toEqual(sheet);
  });

  it("Zugangsdaten im Merkzettel: der Merkzettel entfällt, die Lektion und der Kurs bleiben", async () => {
    const job = await generate(content({ de: j("Zugang:\n-----BEGIN ", "PRIVATE KEY-----\nabc"), en: "Access" }));
    expect(job.status).toBe("published");
    expect((await lessonOf(job.resultCertificationId!)).cheatSheet).toBeNull();
  });

  it("liefert die KI keinen oder einen kaputten Merkzettel, gelingt der Kurs trotzdem", async () => {
    for (const bad of [undefined, null, { de: "nur deutsch" }]) {
      const job = await generate(content(bad));
      expect(job.status, JSON.stringify(bad)).toBe("published");
      expect((await lessonOf(job.resultCertificationId!)).cheatSheet).toBeNull();
    }
  });
});
