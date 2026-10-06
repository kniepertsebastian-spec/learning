/**
 * Interne Lernpfade: Firmendokument → KI-Entwurf → Prüfung → Freigabe. Gegen eine ECHTE Postgres-Datenbank
 * (nur mit TEST_DATABASE_URL), die KI ist durch Fake-Provider ersetzt. Geprüft wird vor allem, was nicht passieren darf:
 * geschwärzte Zeilen oder Zugangsdaten an die KI, fremde Firmen, der Betreiber, unfreigegebene Entwürfe für Lernende.
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
  organizationAiSettings,
  organizationMemberships,
  organizations,
  users,
} from "@/lib/server/db/schema";
import { createFakeBlueprintProvider, createFakeContentProvider } from "@/lib/server/course-generation/fake-providers";
import { getCourseGenerationJob, listCourseGenerationJobs } from "@/lib/server/course-generation/job-service";
import { executeCourseGenerationJob } from "@/lib/server/course-generation/worker";
import type { CourseBlueprintV1, ObjectiveContentResponse } from "@/lib/server/course-generation/schemas";
import { canViewCertification } from "@/lib/server/catalog/visibility";
import { GET as adminJobGet } from "@/app/api/admin/course-generation/[id]/route";
import { POST as startRoute, GET as listRoute } from "@/app/api/internal-courses/route";
import { POST as approveRoute } from "@/app/api/internal-courses/[certId]/approve/route";
import { DELETE as discardRoute } from "@/app/api/internal-courses/[certId]/route";
import { POST as cancelRoute } from "@/app/api/internal-courses/jobs/[id]/cancel/route";
import { encryptSecret } from "@/lib/server/crypto/secret-box";
import { clientForOrganization } from "./ai-client";
import { redactSuppressedLines, REDACTION_MARKER } from "./document-sources";
import { AiAccessUnavailableError, DocumentUnavailableError, startInternalCourse } from "./service";

const run = TEST_DB ? describe : describe.skip;

describe("redactSuppressedLines", () => {
  const pages = [
    { pageNumber: 1, text: "eins\nPasswort: geheim123!\ndrei" },
    { pageNumber: 2, text: "Passwort: bleibt\nzwei" },
  ];
  it("schwärzt genau die bestätigten Zeilen (Seite und Zeile), sonst nichts", () => {
    const out = redactSuppressedLines(pages, [{ kind: "password_assignment", pageNumber: 1, line: 2 }]);
    expect(out[0].text).toBe(`eins\n${REDACTION_MARKER}\ndrei`);
    expect(out[1]).toEqual(pages[1]);
  });
  it("ohne bestätigte Funde bleibt alles unverändert", () => {
    expect(redactSuppressedLines(pages, null)).toBe(pages);
    expect(redactSuppressedLines(pages, [])).toBe(pages);
  });
});

function blueprint(): Omit<CourseBlueprintV1, "requestId"> {
  return {
    schemaVersion: "1.0",
    title: "Onboarding",
    description: "Test",
    language: "de",
    provider: "Intern",
    examQuestionCount: null,
    examDurationMinutes: null,
    passingScore: null,
    scoreScale: null,
    sources: [{ id: "doc-1", title: "Handbuch", url: "dokument:x", retrievedAt: new Date().toISOString() }],
    domains: [
      {
        id: "dom-1",
        title: "Grundlagen",
        weight: 1,
        objectives: [
          {
            id: "obj-1", code: "1.1", title: "Ziel 1", description: "Beschreibung", examWeight: 1,
            complexity: "medium", requiredConcepts: ["concept-a"], commonMisconceptions: [], lessonPlan: ["Schritt 1"],
            sourceLocators: ["Abschnitt 1"], recommendedQuestions: 4, requiredScenarios: [],
          },
        ],
      },
    ],
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
      sourceLocator: "Abschnitt 1",
    })),
  };
}

const SECRET_LINE = "Passwort: Sommer-2024-geheim!";
const BODY = Array.from({ length: 12 }, (_, i) => `Zeile ${i + 1}: Im Onboarding erklären wir concept-a ausführlich für neue Kolleginnen und Kollegen.`).join("\n");

run("Interne Lernpfade (echte DB, Fake-KI)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids = { orgs: [] as string[], users: [] as string[], certs: [] as string[] };
  const u: Record<string, string> = {};
  let orgA = "";
  let orgB = "";
  let docOk = "";
  let docSecret = "";
  let docExcluded = "";

  const as = (key: string | null) => authMock.mockResolvedValue(key ? { user: { id: u[key] } } : null);
  const json = (body: unknown) => new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

  async function mkDoc(org: string, title: string, text: string, extra: Partial<typeof companyDocuments.$inferInsert> = {}) {
    const [d] = await getDb().insert(companyDocuments).values({
      organizationId: org, title, originalFilename: `${title}.txt`, mimeType: "text/plain",
      sizeBytes: text.length, checksum: randomUUID(), pageCount: 1, ...extra,
    }).returning();
    await getDb().insert(companyDocumentFiles).values({ documentId: d.id, data: Buffer.from(text, "utf-8") });
    return d.id;
  }

  async function runJob(jobId: string, seen?: { text: string }) {
    const bp = createFakeBlueprintProvider(blueprint());
    const spy = { ...bp, async generateBlueprint(input: Parameters<typeof bp.generateBlueprint>[0], onUsage: Parameters<typeof bp.generateBlueprint>[1]) {
      if (seen) seen.text = input.sources.flatMap((s) => s.excerpts.map((e) => e.text)).join("\n");
      return bp.generateBlueprint(input, onUsage);
    } };
    const content = createFakeContentProvider("fake-content", { "obj-1": { result: goodContent() } });
    await executeCourseGenerationJob(jobId, { blueprintProvider: spy, contentProvider: content, repairProvider: content });
    return getCourseGenerationJob(jobId);
  }

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = "test-platform-key";
    const d = getDb();
    orgA = (await d.insert(organizations).values({ name: `IntA ${tag}` }).returning())[0].id;
    orgB = (await d.insert(organizations).values({ name: `IntB ${tag}` }).returning())[0].id;
    ids.orgs.push(orgA, orgB);
    const mkUser = async (key: string, role: "learner" | "admin", org?: string, orgRole?: "company_admin" | "mentor" | "learner") => {
      const [x] = await d.insert(users).values({ email: `${key}-${tag}@test.example`, name: `Name ${key}`, passwordHash: "x", role }).returning({ id: users.id });
      u[key] = x.id;
      ids.users.push(x.id);
      if (org) await d.insert(organizationMemberships).values({ organizationId: org, userId: x.id, role: orgRole! });
    };
    await mkUser("adminA", "learner", orgA, "company_admin");
    await mkUser("mentorA", "learner", orgA, "mentor");
    await mkUser("learnerA", "learner", orgA, "learner");
    await mkUser("mentorB", "learner", orgB, "mentor");
    await mkUser("operator", "admin");

    docOk = await mkDoc(orgA, "Handbuch", `${BODY}\n${SECRET_LINE}\nSchluss`, {
      scannerSuppressed: [{ kind: "password_assignment", pageNumber: 1, line: 13 }],
    });
    docSecret = await mkDoc(orgA, "MitGeheimnis", `${BODY}\n${SECRET_LINE}\nSchluss`);
    docExcluded = await mkDoc(orgA, "Ausgeschlossen", BODY, { excludeFromAi: true });
  });
  afterAll(async () => {
    const d = getDb();
    await d.delete(courseGenerationJobs).where(inArray(courseGenerationJobs.organizationId, ids.orgs));
    await d.delete(certifications).where(inArray(certifications.ownerOrganizationId, ids.orgs));
    await d.delete(organizations).where(inArray(organizations.id, ids.orgs));
    await d.delete(users).where(inArray(users.id, ids.users));
  });

  it("ohne eingerichteten KI-Zugang startet nichts", async () => {
    await expect(startInternalCourse({ organizationId: orgA, userId: u.adminA, documentId: docOk, title: "X", language: "de", startWorker: false })).rejects.toBeInstanceOf(AiAccessUnavailableError);
    as("adminA");
    const res = await startRoute(json({ documentId: docOk, title: "X" }));
    expect(res.status).toBe(409);
  });

  it("KI-Zugang je Firma: nicht eingerichtet, Schlüssel fehlt, eigener Schlüssel → eigener Client, Plattform ohne Schlüssel", async () => {
    const [orgC] = await getDb().insert(organizations).values({ name: `IntC ${tag}` }).returning();
    ids.orgs.push(orgC.id);
    await expect(clientForOrganization(orgC.id)).rejects.toThrow(/KI-Zugang/);
    await getDb().insert(organizationAiSettings).values({ organizationId: orgC.id, mode: "byok" });
    await expect(clientForOrganization(orgC.id)).rejects.toThrow(/Schlüssel/);
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    await getDb().update(organizationAiSettings).set({ keyEncrypted: encryptSecret("AIzaTESTKEY0123456789"), keyLast4: "6789" }).where(eq(organizationAiSettings.organizationId, orgC.id));
    expect(await clientForOrganization(orgC.id)).toBeDefined();
    await getDb().update(organizationAiSettings).set({ mode: "platform" }).where(eq(organizationAiSettings.organizationId, orgC.id));
    expect(await clientForOrganization(orgC.id)).toBeUndefined(); // Plattform-Client
    delete process.env.GEMINI_API_KEY;
    await expect(clientForOrganization(orgC.id)).rejects.toThrow(/nicht verfügbar/);
    process.env.GEMINI_API_KEY = "test-platform-key";
  });

  it("Dokumente: fremde Firma und von der KI ausgeschlossene werden abgelehnt", async () => {
    await getDb().insert(organizationAiSettings).values([{ organizationId: orgA, mode: "platform" }, { organizationId: orgB, mode: "platform" }]);
    await expect(startInternalCourse({ organizationId: orgB, userId: u.mentorB, documentId: docOk, title: "Fremd", language: "de", startWorker: false })).rejects.toBeInstanceOf(DocumentUnavailableError);
    await expect(startInternalCourse({ organizationId: orgA, userId: u.adminA, documentId: docExcluded, title: "Aus", language: "de", startWorker: false })).rejects.toBeInstanceOf(DocumentUnavailableError);
  });

  let certId = "";
  let slug = "";

  it("Lernende dürfen nicht starten; Mentor startet, die KI bekommt den Text OHNE die geschwärzte Zeile", async () => {
    as("learnerA");
    expect((await startRoute(json({ documentId: docOk, title: "Onboarding" }))).status).toBe(403);
    as(null);
    expect((await startRoute(json({ documentId: docOk, title: "Onboarding" }))).status).toBe(401);

    const { jobId } = await startInternalCourse({ organizationId: orgA, userId: u.mentorA, documentId: docOk, title: "Onboarding", language: "de", startWorker: false });
    const seen = { text: "" };
    const job = await runJob(jobId, seen);
    expect(job?.status).toBe("published");
    expect(seen.text).toContain("concept-a");
    expect(seen.text).not.toContain("Sommer-2024");
    expect(seen.text).toContain(REDACTION_MARKER);

    const [cert] = await getDb().select().from(certifications).where(eq(certifications.id, job!.resultCertificationId!));
    ids.certs.push(cert.id);
    expect(cert.kind).toBe("internal");
    expect(cert.ownerOrganizationId).toBe(orgA);
    expect(cert.catalogStatus).toBe("draft");
    expect(cert.slug.endsWith(jobId.slice(0, 8))).toBe(true);
    certId = cert.id;
    slug = cert.slug;
  });

  it("ein Dokument mit nicht bestätigten Zugangsdaten geht nie an die KI (Preflight bricht ab)", async () => {
    const { jobId } = await startInternalCourse({ organizationId: orgA, userId: u.adminA, documentId: docSecret, title: "Geheim", language: "de", startWorker: false });
    const seen = { text: "" };
    const job = await runJob(jobId, seen);
    expect(job?.status).toBe("preflight_failed");
    expect(job?.errorMessage).toMatch(/Zugangsdaten/);
    expect(seen.text).toBe("");
  });

  it("der Betreiber sieht weder Aufträge noch Lernpfad: Liste leer, Auftrag 404, Entwurf unsichtbar", async () => {
    const operatorJobs = await listCourseGenerationJobs(100);
    expect(operatorJobs.some((j) => j.organizationId)).toBe(false);
    const [job] = await getDb().select().from(courseGenerationJobs).where(eq(courseGenerationJobs.organizationId, orgA)).limit(1);
    as("operator");
    expect((await adminJobGet(new Request("http://x") as never, ctx({ id: job.id }) as never)).status).toBe(404);
    expect(await canViewCertification({ id: u.operator, role: "admin" }, { kind: "internal", ownerOrganizationId: orgA, catalogStatus: "draft" })).toBe(false);
  });

  it("Entwurf sehen nur Mentor und Firmen-Admin der Firma, Lernende und fremde Firmen nicht", async () => {
    const cert = { kind: "internal" as const, ownerOrganizationId: orgA, catalogStatus: "draft" as const };
    expect(await canViewCertification({ id: u.mentorA, role: "learner" }, cert)).toBe(true);
    expect(await canViewCertification({ id: u.adminA, role: "learner" }, cert)).toBe(true);
    expect(await canViewCertification({ id: u.learnerA, role: "learner" }, cert)).toBe(false);
    expect(await canViewCertification({ id: u.mentorB, role: "learner" }, cert)).toBe(false);
  });

  it("Firmenliste: nur eigene Aufträge und Lernpfade", async () => {
    as("mentorA");
    const own = await (await listRoute()).json();
    expect(own.courses.map((c: { id: string }) => c.id)).toContain(certId);
    as("mentorB");
    const other = await (await listRoute()).json();
    expect(other.courses).toHaveLength(0);
    expect(other.jobs).toHaveLength(0);
  });

  it("Freigabe: Lernende und fremde Firma scheitern, der Mentor gibt mit Name und Datum frei", async () => {
    as("learnerA");
    expect((await approveRoute(json({}), ctx({ certId }) as never)).status).toBe(403);
    as("mentorB");
    expect((await approveRoute(json({}), ctx({ certId }) as never)).status).toBe(404);
    as("operator");
    expect((await approveRoute(json({}), ctx({ certId }) as never)).status).toBe(403);

    as("mentorA");
    expect((await approveRoute(json({}), ctx({ certId }) as never)).status).toBe(200);
    const [cert] = await getDb().select().from(certifications).where(eq(certifications.id, certId));
    expect(cert.catalogStatus).toBe("approved");
    expect(cert.approvedByName).toBe("Name mentorA");
    expect(cert.approvedAt).not.toBeNull();
    // erneut freigeben: nichts mehr zu tun
    expect((await approveRoute(json({}), ctx({ certId }) as never)).status).toBe(404);
    // jetzt sehen es auch Lernende der Firma, andere Firmen und der Betreiber weiterhin nicht
    const approved = { kind: "internal" as const, ownerOrganizationId: orgA, catalogStatus: "approved" as const };
    expect(await canViewCertification({ id: u.learnerA, role: "learner" }, approved)).toBe(true);
    expect(await canViewCertification({ id: u.mentorB, role: "learner" }, approved)).toBe(false);
    expect(await canViewCertification({ id: u.operator, role: "admin" }, approved)).toBe(false);
    void slug;
  });

  it("Verwerfen: nur Entwürfe der eigenen Firma, freigegebene bleiben", async () => {
    const { jobId } = await startInternalCourse({ organizationId: orgA, userId: u.adminA, documentId: docOk, title: "Zweiter", language: "de", startWorker: false });
    const job = await runJob(jobId);
    const draftId = job!.resultCertificationId!;
    as("mentorB");
    expect((await discardRoute(new Request("http://x", { method: "DELETE" }), ctx({ certId: draftId }) as never)).status).toBe(404);
    as("mentorA");
    expect((await discardRoute(new Request("http://x", { method: "DELETE" }), ctx({ certId }) as never)).status).toBe(404); // freigegeben
    expect((await discardRoute(new Request("http://x", { method: "DELETE" }), ctx({ certId: draftId }) as never)).status).toBe(200);
    expect(await getDb().select().from(certifications).where(eq(certifications.id, draftId))).toHaveLength(0);
  });

  it("Abbrechen: nur laufende Aufträge der eigenen Firma", async () => {
    const { jobId } = await startInternalCourse({ organizationId: orgA, userId: u.adminA, documentId: docOk, title: "Abbruch", language: "de", startWorker: false });
    as("mentorB");
    expect((await cancelRoute(json({}), ctx({ id: jobId }) as never)).status).toBe(404);
    as("mentorA");
    expect((await cancelRoute(json({}), ctx({ id: jobId }) as never)).status).toBe(200);
    expect((await getCourseGenerationJob(jobId))?.status).toBe("cancelled");
    expect((await cancelRoute(json({}), ctx({ id: jobId }) as never)).status).toBe(404); // schon beendet
  });
});
