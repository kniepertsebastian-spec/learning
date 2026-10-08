/**
 * Interne Kurse aus mehreren, nur temporär hochgeladenen Dateien (echte DB, Fake-KI): alle Dateien gehen an die KI (mit
 * Dateiname im Verweis), nach der Erstellung sind sie gelöscht, bei einem Fund in EINER Datei startet nichts, und verwaiste
 * temporäre Dateien räumt der Aufräumer weg, ohne gespeicherte Dokumente anzufassen.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));
// Dieser Test startet mehr Aufträge als das Limit je Firma erlaubt; das Limit selbst prüfen andere Tests.
vi.mock("@/lib/server/auth-rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/server/auth-rate-limit")>()), checkInternalCourseRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }) }));

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications, companyDocumentFiles, companyDocuments, courseGenerationJobDocuments, courseGenerationJobs,
  organizationAiSettings, organizationMemberships, organizations, users,
} from "@/lib/server/db/schema";
import { createFakeBlueprintProvider, createFakeContentProvider } from "@/lib/server/course-generation/fake-providers";
import { getCourseGenerationJob } from "@/lib/server/course-generation/job-service";
import { executeCourseGenerationJob, selectSourceExcerpts } from "@/lib/server/course-generation/worker";
import { capTotalChars } from "@/lib/server/course-generation/sources";
import type { CourseBlueprintV1, ObjectiveContentResponse } from "@/lib/server/course-generation/schemas";
import { listCompanyDocuments } from "@/lib/server/company/documents";
import { POST as startRoute } from "@/app/api/internal-courses/route";
import { cleanupJobDocuments, cleanupJobDocumentsIfDone, purgeOrphanTemporaryDocuments } from "./temporary-documents";

const run = TEST_DB ? describe : describe.skip;

describe("selectSourceExcerpts", () => {
  const sources = [
    { id: "a", title: "A", url: "x", retrievedAt: "", truncated: false, excerpts: [{ locator: "a.yml · Abschnitt 1", text: "x".repeat(60) }] },
    { id: "b", title: "B", url: "y", retrievedAt: "", truncated: false, excerpts: [{ locator: "b.py · Abschnitt 1", text: "y".repeat(60) }] },
  ];
  it("nimmt die genannten Verweise; ohne Treffer oder ohne Angabe alle, gekürzt auf die Höchstmenge", () => {
    expect(selectSourceExcerpts(sources, ["b.py · Abschnitt 1"]).map((e) => e.locator)).toEqual(["b.py · Abschnitt 1"]);
    expect(selectSourceExcerpts(sources, ["gibt es nicht"])).toHaveLength(2);
    expect(selectSourceExcerpts(sources, [])).toHaveLength(2);
    const capped = selectSourceExcerpts(sources, [], 90);
    expect(capped.map((e) => e.text.length)).toEqual([60, 30]);
    expect(selectSourceExcerpts(sources, [], 60)).toHaveLength(1);
  });
});

describe("capTotalChars", () => {
  const mk = (id: string, n: number) => ({ id, title: id, url: id, retrievedAt: "", truncated: false, excerpts: [{ locator: id, text: "z".repeat(n) }] });
  it("lässt kleine Mengen unverändert und kürzt große anteilig mit Hinweis", () => {
    const small = [mk("a", 100), mk("b", 100)];
    expect(capTotalChars(small, 1000)).toEqual(small);
    const out = capTotalChars([mk("a", 5000), mk("b", 5000)], 6000);
    const total = out.reduce((n, s) => n + s.excerpts.reduce((m, e) => m + e.text.length, 0), 0);
    expect(total).toBeLessThanOrEqual(6000);
    expect(out.every((s) => s.truncated && (s.warnings?.length ?? 0) > 0)).toBe(true);
  });
});

/** Verweis, den die Fake-KI nennt (bei mehreren Dateien trägt er den Dateinamen). */
const LOC = { value: "playbook · Abschnitt 1" };

function blueprint(): Omit<CourseBlueprintV1, "requestId"> {
  return {
    schemaVersion: "1.0", title: "Netzwerk", description: "Test", language: "de", provider: "Intern",
    examQuestionCount: null, examDurationMinutes: null, passingScore: null, scoreScale: null,
    sources: [{ id: "doc-1", title: "x", url: "dokument:x", retrievedAt: new Date().toISOString() }],
    domains: [{
      id: "dom-1", title: "Grundlagen", weight: 1,
      objectives: [{
        id: "obj-1", code: "1.1", title: "Ziel 1", description: "Beschreibung", examWeight: 1, complexity: "medium",
        requiredConcepts: ["concept-a"], commonMisconceptions: [], lessonPlan: ["Schritt 1"],
        sourceLocators: [LOC.value], recommendedQuestions: 4, requiredScenarios: [],
      }],
    }],
  };
}
function goodContent(): ObjectiveContentResponse {
  return {
    sections: [
      {
        title: { de: "Abschnitt", en: "Section" }, estimatedMinutes: 15, difficulty: "beginner",
        content: { de: "Lerninhalt über concept-a.", en: "Lesson content about concept-a." },
        keyTakeaways: { de: ["a", "b"], en: ["a", "b"] }, examFocusPoints: { de: ["a", "b"], en: ["a", "b"] },
      },
    ],
    questions: Array.from({ length: 4 }, (_, i) => ({
      difficulty: "beginner" as const,
      type: (i === 0 ? "scenario" : "knowledge") as "scenario" | "knowledge",
      question: { de: `Frage ${i + 1} zu concept-a?`, en: `Question ${i + 1} about concept-a?` },
      options: ["Richtig", "Falsch 1", "Falsch 2", "Falsch 3"].map((t, idx) => ({ text: { de: t, en: t }, isCorrect: idx === i % 4 })),
      explanation: { de: "Erklärung zu concept-a.", en: "Explanation about concept-a." },
      sourceLocator: LOC.value,
    })),
  };
}

const BODY = (n: string) => Array.from({ length: 8 }, (_, i) => `${n} Zeile ${i + 1}: Hier wird concept-a für die Netzwerkumgebung erklärt.`).join("\n");

run("Mehrere temporäre Dateien je Kurs (echte DB, Fake-KI)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids = { orgs: [] as string[], users: [] as string[] };
  const u: Record<string, string> = {};
  let org = "";
  const as = (key: string | null) => authMock.mockResolvedValue(key ? { user: { id: u[key] } } : null);
  const countTemp = async () => (await getDb().select({ id: companyDocuments.id }).from(companyDocuments).where(eq(companyDocuments.organizationId, org))).filter(Boolean).length;

  function form(files: { name: string; type: string; text: string }[], extra: Record<string, string | string[]> = {}) {
    const f = new FormData();
    f.set("title", `Netzwerk ${randomUUID().slice(0, 6)}`);
    for (const file of files) f.append("files", new File([file.text], file.name, { type: file.type }));
    for (const [k, v] of Object.entries(extra)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
    return new Request("http://x", { method: "POST", body: f });
  }

  async function runJob(jobId: string, seen: { locators: string[] }) {
    const bp = createFakeBlueprintProvider(blueprint());
    const spy = { ...bp, async generateBlueprint(input: Parameters<typeof bp.generateBlueprint>[0], onUsage: Parameters<typeof bp.generateBlueprint>[1]) {
      seen.locators = input.sources.flatMap((s) => s.excerpts.map((e) => e.locator));
      return bp.generateBlueprint(input, onUsage);
    } };
    const content = createFakeContentProvider("fake-content", { "obj-1": { result: goodContent() } });
    await executeCourseGenerationJob(jobId, { blueprintProvider: spy, contentProvider: content, repairProvider: content });
    return getCourseGenerationJob(jobId);
  }

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = "test-platform-key";
    const d = getDb();
    org = (await d.insert(organizations).values({ name: `Multi ${tag}` }).returning())[0].id;
    ids.orgs.push(org);
    await d.insert(organizationAiSettings).values({ organizationId: org, mode: "platform" });
    for (const [key, role] of [["admin", "company_admin"], ["mentor", "mentor"], ["learner", "learner"]] as const) {
      const [x] = await d.insert(users).values({ email: `${key}-${tag}@test.example`, name: key, passwordHash: "x", role: "learner" }).returning({ id: users.id });
      u[key] = x.id;
      ids.users.push(x.id);
      await d.insert(organizationMemberships).values({ organizationId: org, userId: x.id, role });
    }
  });
  afterAll(async () => {
    const d = getDb();
    await d.delete(courseGenerationJobs).where(inArray(courseGenerationJobs.organizationId, ids.orgs));
    await d.delete(certifications).where(inArray(certifications.ownerOrganizationId, ids.orgs));
    await d.delete(organizations).where(inArray(organizations.id, ids.orgs));
    await d.delete(users).where(inArray(users.id, ids.users));
  });

  it("Lernende dürfen nicht hochladen", async () => {
    as("learner");
    expect((await startRoute(form([{ name: "a.yml", type: "application/x-yaml", text: BODY("a") }]))).status).toBe(403);
    expect(await countTemp()).toBe(0);
  });

  it("yml, py und txt zusammen: alle Dateien gehen mit Dateinamen an die KI, danach sind sie gelöscht und nie unter „Dokumente“ sichtbar", async () => {
    as("mentor");
    const res = await startRoute(form([
      { name: "playbook.yml", type: "application/x-yaml", text: BODY("yml") },
      { name: "check.py", type: "text/x-python", text: BODY("py") },
      { name: "notizen.txt", type: "text/plain", text: BODY("txt") },
    ]));
    expect(res.status).toBe(202);
    const { jobId } = await res.json();
    expect(await countTemp()).toBe(3);
    expect(await listCompanyDocuments(org)).toHaveLength(0);
    const links = await getDb().select().from(courseGenerationJobDocuments).where(eq(courseGenerationJobDocuments.jobId, jobId));
    expect(links.map((l) => l.orderNum).sort()).toEqual([0, 1, 2]);

    const seen = { locators: [] as string[] };
    const job = await runJob(jobId, seen);
    expect(job?.status).toBe("published");
    expect(seen.locators.some((l) => l.startsWith("playbook · "))).toBe(true);
    expect(seen.locators.some((l) => l.startsWith("check · "))).toBe(true);
    expect(seen.locators.some((l) => l.startsWith("notizen · "))).toBe(true);
    // Das Aufräumen läuft im Runner; hier direkt.
    await cleanupJobDocumentsIfDone(jobId);
    expect(await countTemp()).toBe(0);
    expect(await getDb().select().from(courseGenerationJobDocuments).where(eq(courseGenerationJobDocuments.jobId, jobId))).toHaveLength(0);
  });

  it("ein Fund in einer Datei: nichts startet, keine Datei bleibt liegen, die Antwort nennt die Datei und Stelle (nie den Wert)", async () => {
    as("admin");
    const before = (await getDb().select().from(courseGenerationJobs).where(eq(courseGenerationJobs.organizationId, org))).length;
    const res = await startRoute(form([
      { name: "ok.yml", type: "application/x-yaml", text: BODY("ok") },
      { name: "geheim.py", type: "text/x-python", text: `${BODY("g")}\nPasswort: Sommer-2024-geheim!\n` },
    ]));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("files_rejected");
    expect(body.files).toHaveLength(1);
    expect(body.files[0].filename).toBe("geheim.py");
    expect(JSON.stringify(body)).not.toContain("Sommer-2024");
    expect(await countTemp()).toBe(0);
    expect((await getDb().select().from(courseGenerationJobs).where(eq(courseGenerationJobs.organizationId, org))).length).toBe(before);
  });

  it("falscher Typ und zu viele Dateien werden abgelehnt; gespeicherte Dokumente lassen sich dazuwählen und bleiben danach", async () => {
    as("admin");
    expect((await startRoute(form([{ name: "virus.exe", type: "application/octet-stream", text: "MZ" }]))).status).toBe(422);
    const many = Array.from({ length: 51 }, (_, i) => ({ name: `f${i}.txt`, type: "text/plain", text: BODY(String(i)) }));
    expect((await startRoute(form(many))).status).toBe(400);
    expect(await countTemp()).toBe(0);

    const [stored] = await getDb().insert(companyDocuments).values({ organizationId: org, title: "Gespeichert", originalFilename: "g.txt", mimeType: "text/plain", sizeBytes: 10, checksum: randomUUID(), pageCount: 1 }).returning();
    await getDb().insert(companyDocumentFiles).values({ documentId: stored.id, data: Buffer.from(BODY("stored")) });
    const res = await startRoute(form([{ name: "neu.yaml", type: "", text: BODY("neu") }], { documentIds: [stored.id] }));
    expect(res.status).toBe(202);
    const { jobId } = await res.json();
    const seen = { locators: [] as string[] };
    LOC.value = "Gespeichert · Abschnitt 1";
    expect((await runJob(jobId, seen))?.status).toBe("published");
    expect(seen.locators.some((l) => l.startsWith("Gespeichert · "))).toBe(true);
    await cleanupJobDocumentsIfDone(jobId);
    expect(await listCompanyDocuments(org)).toHaveLength(1); // das gespeicherte bleibt, das temporäre ist weg
    expect(await countTemp()).toBe(1);

    // Fremde Firma: ein gespeichertes Dokument einer anderen Firma lässt sich nicht einbinden.
    const other = (await getDb().insert(organizations).values({ name: `Other ${tag}` }).returning())[0].id;
    ids.orgs.push(other);
    const [foreign] = await getDb().insert(companyDocuments).values({ organizationId: other, title: "Fremd", originalFilename: "f.txt", mimeType: "text/plain", sizeBytes: 10, checksum: randomUUID(), pageCount: 1 }).returning();
    const bad = await startRoute(form([{ name: "x.txt", type: "text/plain", text: BODY("x") }], { documentIds: [foreign.id] }));
    expect(bad.status).toBe(404);
    expect(await countTemp()).toBe(1); // das gerade hochgeladene temporäre wurde wieder entfernt
  });

  it("Aufräumer: entfernt Verwaistes und Altes, lässt laufende Aufträge und gespeicherte Dokumente in Ruhe; nach einem Fehler bleiben die Dateien bis zum Ablauf", async () => {
    const d = getDb();
    const mk = async (temporary: boolean, ageHours: number) => {
      const [x] = await d.insert(companyDocuments).values({
        organizationId: org, title: `T${randomUUID().slice(0, 4)}`, originalFilename: "t.txt", mimeType: "text/plain", sizeBytes: 5,
        checksum: randomUUID(), pageCount: 1, temporary,
      }).returning();
      pendingAge.set(x.id, ageHours);
      return x.id;
    };
    // Erst verknüpfen, dann zurückdatieren: sonst könnte der Aufräumer eines parallel laufenden Tests ein frisch angelegtes, noch unverknüpftes altes Dokument löschen.
    const pendingAge = new Map<string, number>();
    const backdate = async () => {
      for (const [id, h] of pendingAge) await d.update(companyDocuments).set({ createdAt: new Date(Date.now() - h * 3600_000) }).where(eq(companyDocuments.id, id));
    };
    const mkJob = async (status: string) => (await d.insert(courseGenerationJobs).values({
      requestedByUserId: u.admin, organizationId: org, courseTitle: `J${randomUUID().slice(0, 6)}`, courseDescription: "x", language: "de", provider: "Intern",
      sourceUrls: [], status, autoPublish: true, initialCostLimitUsd: "1", absoluteCostLimitUsd: "3", blueprintProvider: "anthropic-sonnet",
    } as never).returning())[0].id;
    const link = (jobId: string, documentId: string) => d.insert(courseGenerationJobDocuments).values({ jobId, documentId, orderNum: 0 });

    const stored = await mk(false, 100); // gespeichert, alt: bleibt
    const orphanOld = await mk(true, 2); // nie zugeordnet, > 1 h: weg
    const orphanNew = await mk(true, 0); // nie zugeordnet, frisch (Upload läuft gerade): bleibt
    const running = await mk(true, 3); const runningJob = await mkJob("content_generating"); await link(runningJob, running); // läuft: bleibt
    const failed = await mk(true, 3); const failedJob = await mkJob("failed"); await link(failedJob, failed); // Fehler < 24 h: bleibt (Retry)
    const failedOld = await mk(true, 30); const failedOldJob = await mkJob("failed"); await link(failedOldJob, failedOld); // > 24 h: weg
    const done = await mk(true, 1); const doneJob = await mkJob("published"); await link(doneJob, done); // fertig: weg

    await backdate();
    await purgeOrphanTemporaryDocuments();
    const left = new Set((await d.select({ id: companyDocuments.id }).from(companyDocuments).where(inArray(companyDocuments.id, [stored, orphanOld, orphanNew, running, failed, failedOld, done]))).map((r) => r.id));
    expect([...left].sort()).toEqual([stored, orphanNew, running, failed].sort());

    expect(await cleanupJobDocuments(failedJob)).toBe(1); // ausdrücklich, z. B. beim Verwerfen
    expect(await cleanupJobDocuments(runningJob + "")).toBe(1);
  });
});
