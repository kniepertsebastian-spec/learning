import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import {
  certifications,
  courseGenerationJobs,
  domains,
  lessonCompletions,
  objectives,
  organizationAiSettings,
  organizationMemberships,
  organizations,
  sections,
  users,
} from "../lib/server/db/schema";
import { acceptInvitation, createInvitation } from "../lib/server/company/invitations";
import { uploadCompanyDocument } from "../lib/server/company/documents";
import { assignLearningPath } from "../lib/server/company/assignments";
import { createPracticeTask, listMyPracticeTasks, reviewPracticeSubmission, submitPracticeTask, listPracticeTasksForOrg } from "../lib/server/company/practice-tasks";
import { createOnboardingPlan, listOnboardingPlans, setOnboardingStatus, startOnboarding } from "../lib/server/company/onboardings";
import { listCompanyStatus } from "../lib/server/company/status";
import { approveInternalCourse, startInternalCourse } from "../lib/server/internal-courses/service";
import { executeCourseGenerationJob } from "../lib/server/course-generation/worker";
import { getCourseGenerationJob } from "../lib/server/course-generation/job-service";
import { createFakeBlueprintProvider, createFakeContentProvider } from "../lib/server/course-generation/fake-providers";
import type { CourseBlueprintV1, ObjectiveContentResponse } from "../lib/server/course-generation/schemas";
import { syncAssignmentStatus } from "../lib/server/assignments/sync";
import { CURRICULUM_MODEL } from "../lib/claude";

/**
 * Gate 3 (docs/ROADMAP-TECHNISCH.md): die Testfirma durchläuft einmal alles.
 *   Firma → einladen → Dokument hochladen → interner Lernpfad (KI) → Freigabe → zuweisen → Praxisaufgabe →
 *   durcharbeiten → Onboarding → Statusansicht
 *
 * Usage: npm run gate3 -- [--ai] [--doc <datei>] [--no-tests] [--keep]
 *   (ohne Optionen)  Fake-KI: prüft den ganzen Ablauf gegen die echte Datenbank, ohne KI-Kosten.
 *   --ai             ECHTE KI (GEMINI_API_KEY nötig, kostet Geld; Limit je Auftrag 1 USD, hart 3 USD).
 *   --doc <datei>    Dokument für den Kurs (.pdf .txt .md .json .xml .html), sonst eine Stichwortliste.
 *   --no-tests       Kurs ohne Lektionstests und Prüfung (Abschluss durch Durcharbeiten, wird mitgeprüft).
 *   --keep           Testdaten stehen lassen (Firma „Gate3 …“, Konten *@gate3.invalid) zum Ansehen.
 * Bricht mit Exit-Code 1 ab, wenn ein Schritt scheitert. Räumt sonst auf. Nicht gegen eine Firma mit echten Daten
 * gedacht: es legt eine eigene Firma an und fasst sonst nichts an.
 */

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const REAL_AI = flag("--ai");
const NO_TESTS = flag("--no-tests");
const KEEP = flag("--keep");
const docPath = args.includes("--doc") ? args[args.indexOf("--doc") + 1] : undefined;

const tag = randomUUID().slice(0, 8);
const created = { users: [] as string[], orgs: [] as string[] };
const results: { step: string; ok: boolean; note?: string }[] = [];

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    const value = await fn();
    results.push({ step: name, ok: true });
    console.log(`✓ ${name}`);
    return value;
  } catch (error) {
    const note = error instanceof Error ? error.message : String(error);
    results.push({ step: name, ok: false, note });
    console.log(`✗ ${name}\n    ${note}`);
    throw error;
  }
}
function expect(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const SAMPLE = [
  "Ansible Grundlagen",
  "- Inventory: /etc/ansible/hosts, Gruppen [web] und [db]",
  "- Playbook starten: ansible-playbook site.yml -l web",
  "- Fehlersuche: ansible -m ping all, Logs unter /var/log/ansible.log",
  "VLANs",
  "- VLAN 10 Server, VLAN 20 Clients, Trunk zu core01",
  "- Port prüfen: show interfaces trunk",
].join("\n");

function fakeBlueprint(title: string): Omit<CourseBlueprintV1, "requestId"> {
  return {
    schemaVersion: "1.0", title, description: "Gate 3", language: "de", provider: "Intern",
    examQuestionCount: null, examDurationMinutes: null, passingScore: null, scoreScale: null,
    sources: [{ id: "doc-1", title: "Gate3 Dokument", url: "dokument:x", retrievedAt: new Date().toISOString() }],
    domains: [{
      id: "dom-1", title: "Grundlagen", weight: 1,
      objectives: ["1.1", "1.2"].map((code, i) => ({
        id: `obj-${i + 1}`, code, title: `Ziel ${code}`, description: "Beschreibung", examWeight: 0.5,
        complexity: "medium" as const, requiredConcepts: ["concept-a"], commonMisconceptions: [], lessonPlan: ["Schritt 1"],
        sourceLocators: ["Abschnitt 1"], recommendedQuestions: 4, requiredScenarios: [],
      })),
    }],
  };
}
function fakeContent(): ObjectiveContentResponse {
  return {
    sections: [{
      title: { de: "Abschnitt", en: "Section" }, estimatedMinutes: 10, difficulty: "beginner",
      content: { de: "Lerninhalt über concept-a.", en: "Lesson about concept-a." },
      keyTakeaways: { de: ["a", "b"], en: ["a", "b"] }, examFocusPoints: { de: ["a", "b"], en: ["a", "b"] },
    }],
    questions: Array.from({ length: 4 }, (_, i) => ({
      difficulty: "beginner" as const, type: "knowledge" as const,
      question: { de: `Frage ${i + 1}?`, en: `Question ${i + 1}?` },
      options: [0, 1, 2, 3].map((idx) => ({ text: { de: `Antwort ${idx}`, en: `Answer ${idx}` }, isCorrect: idx === i % 4 })),
      explanation: { de: "Erklärung.", en: "Explanation." }, sourceLocator: "Abschnitt 1",
    })),
  };
}

async function main() {
  console.log(`Gate 3 – Modus: ${REAL_AI ? `ECHTE KI (${CURRICULUM_MODEL})` : "Fake-KI"}, Kurs ${NO_TESTS ? "ohne" : "mit"} Tests\n`);
  if (REAL_AI && !process.env.GEMINI_API_KEY) throw new Error("--ai braucht GEMINI_API_KEY in der Umgebung (.env).");
  const db = getDb();

  const mkUser = async (key: string) => {
    const [x] = await db.insert(users).values({ email: `${key}-${tag}@gate3.invalid`, name: `Gate3 ${key}`, passwordHash: "x", emailVerifiedAt: new Date() } as never).returning({ id: users.id, email: users.email });
    created.users.push(x.id);
    return x;
  };

  const { org, admin, mentor, learner } = await step("Testfirma und Konten angelegt (Admin, Mentor, Lernender)", async () => {
    const [o] = await db.insert(organizations).values({ name: `Gate3 ${tag}` }).returning();
    created.orgs.push(o.id);
    const a = await mkUser("admin");
    const m = await mkUser("mentor");
    const l = await mkUser("learner");
    await db.insert(organizationMemberships).values({ organizationId: o.id, userId: a.id, role: "company_admin" });
    await db.insert(organizationAiSettings).values({ organizationId: o.id, mode: "platform", updatedByUserId: a.id });
    return { org: o, admin: a, mentor: m, learner: l };
  });

  await step("Einladung: Mentor und Lernender nehmen per Link an", async () => {
    for (const person of [mentor, learner]) {
      const { token } = await createInvitation({ organizationId: org.id, createdByUserId: admin.id, email: person.email, role: person === mentor ? "mentor" : "learner" });
      const res = await acceptInvitation({ userId: person.id, userEmail: person.email, token });
      expect(res.ok, `Einladung für ${person.email} nicht angenommen`);
    }
  });

  const documentId = await step("Dokument hochladen (Secret-Scanner läuft)", async () => {
    const name = docPath ? basename(docPath) : "gate3-stichworte.txt";
    const data = docPath ? readFileSync(docPath) : Buffer.from(SAMPLE, "utf8");
    const mime: Record<string, string> = { ".pdf": "application/pdf", ".json": "application/json", ".xml": "application/xml", ".html": "text/html", ".htm": "text/html", ".md": "text/markdown" };
    const res = await uploadCompanyDocument({
      organizationId: org.id, uploadedByUserId: admin.id, title: "Gate3 Dokument", excludeFromAi: false,
      file: { filename: name, mimeType: mime[extname(name).toLowerCase()] ?? "text/plain", data },
    });
    expect(res.ok, `Upload abgelehnt: ${res.ok ? "" : res.message}`);
    return res.document.id;
  });

  const courseId = await step(`Interner Lernpfad aus dem Dokument (${REAL_AI ? "echte KI" : "Fake-KI"})`, async () => {
    const { jobId } = await startInternalCourse({
      organizationId: org.id, userId: mentor.id, documentId, title: "Gate3 Kurs", language: "de",
      includeSectionQuizzes: !NO_TESTS, includeFinalExam: !NO_TESTS, startWorker: false,
    });
    if (REAL_AI) {
      await executeCourseGenerationJob(jobId);
    } else {
      const bp = createFakeBlueprintProvider(fakeBlueprint("Gate3 Kurs"));
      const content = createFakeContentProvider("fake-content", { "obj-1": { result: fakeContent() }, "obj-2": { result: fakeContent() } });
      await executeCourseGenerationJob(jobId, { blueprintProvider: bp, contentProvider: content, repairProvider: content });
    }
    const job = await getCourseGenerationJob(jobId);
    expect(job?.status === "published", `Auftrag endete mit „${job?.status}“: ${job?.errorMessage ?? job?.message ?? ""}`);
    expect(job.resultCertificationId, "Kein Lernpfad entstanden");
    const [cert] = await db.select().from(certifications).where(eq(certifications.id, job.resultCertificationId));
    expect(cert.catalogStatus === "draft", "Entwurf sollte erst nach Freigabe sichtbar sein");
    expect(cert.includeSectionQuizzes === !NO_TESTS && cert.includeFinalExam === !NO_TESTS, "Schalter Tests/Prüfung nicht übernommen");
    return cert.id;
  });

  await step("Freigabe durch den Mentor (Name und Datum gespeichert)", async () => {
    expect(await approveInternalCourse(org.id, courseId, { id: mentor.id, name: "Gate3 mentor" }), "Freigabe fehlgeschlagen");
    const [cert] = await db.select().from(certifications).where(eq(certifications.id, courseId));
    expect(cert.catalogStatus === "approved" && cert.approvedByName && cert.approvedAt, "Freigabe nicht gespeichert");
  });

  await step("Zuweisen an den Lernenden (mit Frist)", async () => {
    const due = new Date(Date.now() + 14 * 86_400_000);
    const res = await assignLearningPath({ organizationId: org.id, assignedByUserId: mentor.id, userIds: [learner.id], certificationId: courseId, dueAt: due });
    expect(res.assigned.length === 1, "Zuweisung nicht angelegt");
  });

  await step("Praxisaufgabe: anlegen, abgeben, vom Mentor bestätigen", async () => {
    const task = await createPracticeTask({ organizationId: org.id, userId: mentor.id, certificationId: courseId, title: "Setze einen Testserver auf" });
    await submitPracticeTask({ organizationId: org.id, userId: learner.id, taskId: task.id, note: "Erledigt auf test01" });
    const { pending } = await listPracticeTasksForOrg(org.id);
    const sub = pending.find((p) => p.taskTitle === "Setze einen Testserver auf");
    expect(sub, "Abgabe nicht in der Mentor-Liste");
    expect(await reviewPracticeSubmission({ organizationId: org.id, reviewerId: mentor.id, submissionId: sub.id, decision: "confirm" }), "Bestätigung fehlgeschlagen");
    const mine = await listMyPracticeTasks(org.id, learner.id);
    expect(mine.some((t) => t.taskId === task.id && t.status === "confirmed"), "Aufgabe beim Lernenden nicht bestätigt");
  });

  if (NO_TESTS) {
    await step("Lektionen durcharbeiten: Zuweisung wird „abgeschlossen“", async () => {
      const secs = await db
        .select({ id: sections.id })
        .from(sections)
        .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
        .innerJoin(domains, eq(domains.id, objectives.domainId))
        .where(eq(domains.certificationId, courseId));
      expect(secs.length > 0, "Der Kurs hat keine Lektionen");
      await db.insert(lessonCompletions).values(secs.map((s) => ({ userId: learner.id, sectionId: s.id }))).onConflictDoNothing();
      await syncAssignmentStatus(learner.id, courseId);
    });
  }

  await step("Onboarding: Plan anlegen, starten, besprochen" + (NO_TESTS ? ", geprüft" : ""), async () => {
    const plan = await createOnboardingPlan({ organizationId: org.id, userId: admin.id, name: "Gate3 Onboarding", mentorUserId: mentor.id, certificationIds: [courseId] });
    const res = await startOnboarding({ organizationId: org.id, actorUserId: mentor.id, planId: plan.id, userIds: [learner.id] });
    expect(res.started.length === 1, "Onboarding nicht gestartet");
    const view = (await listOnboardingPlans(org.id)).find((p) => p.id === plan.id);
    const person = view?.people[0];
    expect(person, "Person fehlt im Plan");
    await setOnboardingStatus({ organizationId: org.id, actorUserId: mentor.id, actorRole: "mentor", onboardingId: person.id, status: "discussed" });
    if (NO_TESTS) {
      await setOnboardingStatus({ organizationId: org.id, actorUserId: mentor.id, actorRole: "mentor", onboardingId: person.id, status: "reviewed" });
    }
  });

  await step("Statusansicht: zeigt Lernenden, Pfad, Praxisaufgabe und den erwarteten Status", async () => {
    const rows = await listCompanyStatus(org.id);
    const row = rows.find((r) => r.memberId === learner.id && r.learningPath === "Gate3 Kurs");
    expect(row, "Zeile fehlt in der Statusansicht");
    expect(row.practiceConfirmed === 1 && row.practiceTotal === 1, "Praxisaufgabe fehlt im Status");
    expect(row.dueAt, "Frist fehlt");
    const expected = NO_TESTS ? "completed" : "assigned";
    expect(row.status === expected, `Status ist „${row.status}“, erwartet „${expected}“`);
  });

  return courseId;
}

async function cleanup() {
  if (KEEP) {
    console.log(`\nTestdaten bleiben stehen: Firma „Gate3 ${tag}“, Konten *-${tag}@gate3.invalid`);
    return;
  }
  const db = getDb();
  if (created.orgs.length) {
    await db.delete(courseGenerationJobs).where(inArray(courseGenerationJobs.organizationId, created.orgs));
    await db.delete(certifications).where(inArray(certifications.ownerOrganizationId, created.orgs));
    await db.delete(organizations).where(inArray(organizations.id, created.orgs));
  }
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  console.log("\nTestdaten aufgeräumt.");
}

main()
  .catch((error) => {
    // Fehler außerhalb eines Schritts (z. B. keine Datenbankverbindung) zählt als Durchfall, nie als Bestehen.
    if (results.every((r) => r.ok)) {
      const note = error instanceof Error ? error.message : String(error);
      results.push({ step: "Vorbereitung", ok: false, note });
      console.log(`✗ Vorbereitung\n    ${note}`);
    }
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("Aufräumen fehlgeschlagen:", e));
    const failed = results.filter((r) => !r.ok);
    console.log(failed.length === 0 ? `\nGATE 3 BESTANDEN (${results.length} Schritte)` : `\nGATE 3 NICHT BESTANDEN: ${failed.length} von ${results.length} Schritten fehlgeschlagen`);
    process.exit(failed.length === 0 ? 0 : 1);
  });
