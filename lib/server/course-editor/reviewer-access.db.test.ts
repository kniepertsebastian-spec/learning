/** Prüfer bearbeiten ihren Kurs von Hand (roadmap_bugs_features 3.1): Rechte und Grenzen gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { getDb } from "@/lib/server/db/client";
import { contentRevisions, courseReviewers, sections, users, type UserRole } from "@/lib/server/db/schema";
import { GET as treeRoute } from "@/app/api/admin/certifications/[certId]/workshop/tree/route";
import { DELETE as deleteSectionRoute, GET as getSectionRoute, PUT as putSectionRoute } from "@/app/api/admin/certifications/[certId]/workshop/sections/[sectionId]/route";
import { POST as createSectionRoute } from "@/app/api/admin/certifications/[certId]/workshop/objectives/[objectiveId]/sections/route";
import { POST as createQuestionRoute } from "@/app/api/admin/certifications/[certId]/workshop/objectives/[objectiveId]/questions/route";
import { PUT as putQuestionRoute } from "@/app/api/admin/certifications/[certId]/workshop/questions/[questionId]/route";
import { GET as overviewRoute } from "@/app/api/admin/certifications/[certId]/workshop/overview/route";
import { GET as checkpointsRoute } from "@/app/api/admin/certifications/[certId]/workshop/checkpoints/route";
import { seedCourse, seedLessons } from "@/lib/server/psrp/test-db";
import { questionOptions } from "@/lib/server/db/schema";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (userId: string | null) => authMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
const json = (method: string, body?: unknown) => new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

run("Prüfer bearbeiten ihren Kurs (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const u: Record<string, string> = {};
  let own: { certId: string; objectiveId: string; sectionId: string; questionId: string };
  let other: { certId: string; sectionId: string };

  async function makeUser(key: string, role: UserRole) {
    const [row] = await getDb().insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key, role }).returning({ id: users.id });
    u[key] = row.id;
  }
  async function course() {
    const c = await seedCourse(1);
    const [sectionId] = await seedLessons(c.objectiveId, ["Inhalt"]);
    await getDb().insert(questionOptions).values([1, 2].map((n) => ({ questionId: c.questionIds[0], orderNum: n, text: { de: `A${n}`, en: `A${n}` }, isCorrect: n === 1 })));
    return { certId: c.certId, objectiveId: c.objectiveId, sectionId, questionId: c.questionIds[0] };
  }
  const snapshot = (text: string) => ({ title: { de: "Titel", en: "Title" }, estimatedMinutes: 5, difficulty: "beginner", content: { de: text, en: text }, keyTakeaways: null, examFocusPoints: null, cheatSheet: null });

  beforeAll(async () => {
    for (const [key, role] of [["reviewer", "reviewer"], ["admin", "admin"], ["learner", "learner"], ["stranger", "reviewer"]] as const) await makeUser(key, role);
    own = await course();
    other = await course();
    await getDb().insert(courseReviewers).values({ certificationId: own.certId, userId: u.reviewer });
    await getDb().insert(courseReviewers).values({ certificationId: other.certId, userId: u.stranger });
  });

  it("der zugewiesene Prüfer sieht die Gliederung und liest Lektionen", async () => {
    signInAs(u.reviewer);
    const tree = await treeRoute(json("GET"), ctx({ certId: own.certId }));
    expect(tree.status).toBe(200);
    const section = await getSectionRoute(json("GET"), ctx({ certId: own.certId, sectionId: own.sectionId }));
    expect(section.status).toBe(200);
  });

  it("Lektion von Hand ändern (mit Revision), neu anlegen und löschen", async () => {
    signInAs(u.reviewer);
    const read = (await (await getSectionRoute(json("GET"), ctx({ certId: own.certId, sectionId: own.sectionId }))).json()) as { fingerprint: string };
    const saved = await putSectionRoute(json("PUT", { snapshot: snapshot("Neuer Text"), baseFingerprint: read.fingerprint }), ctx({ certId: own.certId, sectionId: own.sectionId }));
    expect(saved.status).toBe(200);
    expect(await getDb().select().from(contentRevisions).where(and(eq(contentRevisions.targetId, own.sectionId), eq(contentRevisions.certificationId, own.certId)))).toHaveLength(1);

    const created = await createSectionRoute(json("POST", { snapshot: snapshot("Zweite Lektion") }), ctx({ certId: own.certId, objectiveId: own.objectiveId }));
    expect(created.status).toBe(201);
    const { sectionId } = (await created.json()) as { sectionId: string };

    const removed = await deleteSectionRoute(json("DELETE"), ctx({ certId: own.certId, sectionId }));
    expect(removed.status).toBe(204);
    expect(await getDb().select().from(sections).where(eq(sections.id, sectionId))).toHaveLength(0);
    // Der letzte Stand bleibt als Version erhalten.
    const revisions = await getDb().select().from(contentRevisions).where(eq(contentRevisions.targetId, sectionId));
    expect(revisions).toHaveLength(1);
    expect(revisions[0].note).toContain("Löschen");
  });

  it("Fragen: neue Frage anlegen und eine vorhandene ändern", async () => {
    signInAs(u.reviewer);
    const q = { question: { de: "Neu?", en: "New?" }, explanation: { de: "Weil.", en: "Because." }, difficulty: "beginner", type: "knowledge", options: [{ text: { de: "Ja", en: "Yes" }, isCorrect: true, rationale: null }, { text: { de: "Nein", en: "No" }, isCorrect: false, rationale: null }] };
    const created = await createQuestionRoute(json("POST", { question: q }), ctx({ certId: own.certId, objectiveId: own.objectiveId }));
    expect(created.status).toBe(201);
    // KI-Vorschläge übernehmen darf nur ein Admin
    const ai = await createQuestionRoute(json("POST", { questions: [q], ai: true }), ctx({ certId: own.certId, objectiveId: own.objectiveId }));
    expect(ai.status).toBe(403);
    const opt = (isCorrect: boolean, n: number) => ({ id: randomUUID(), orderNum: n, text: { de: "A", en: "A" }, isCorrect, rationale: null });
    const snap = { question: { de: "F?", en: "Q?" }, explanation: { de: "E", en: "E" }, difficulty: "beginner", type: "knowledge", options: [opt(true, 1), opt(false, 2)] };
    const withAi = await putQuestionRoute(json("PUT", { snapshot: snap, baseFingerprint: "x", ai: { action: "improve", resolveReports: false } }), ctx({ certId: own.certId, questionId: own.questionId }));
    expect(withAi.status).toBe(403);
  });

  it("Grenzen: fremder Kurs 404, Lernende 403, Kursverwaltung und Gemerkte Stände bleiben Admins vorbehalten", async () => {
    signInAs(u.reviewer);
    expect((await treeRoute(json("GET"), ctx({ certId: other.certId }))).status).toBe(404);
    expect((await putSectionRoute(json("PUT", { snapshot: snapshot("x"), baseFingerprint: "x" }), ctx({ certId: other.certId, sectionId: other.sectionId }))).status).toBe(404);
    expect((await deleteSectionRoute(json("DELETE"), ctx({ certId: other.certId, sectionId: other.sectionId }))).status).toBe(404);
    expect(await getDb().select().from(sections).where(eq(sections.id, other.sectionId))).toHaveLength(1);
    // nur manuelle Bearbeitung: Beschreibung und Kursstände nicht
    expect((await overviewRoute(json("GET"), ctx({ certId: own.certId }))).status).toBe(403);
    expect((await checkpointsRoute(json("GET"), ctx({ certId: own.certId }))).status).toBe(403);

    signInAs(u.learner);
    expect((await treeRoute(json("GET"), ctx({ certId: own.certId }))).status).toBe(403);
    signInAs(null);
    expect((await treeRoute(json("GET"), ctx({ certId: own.certId }))).status).toBe(401);
  });

  it("Admins bearbeiten weiterhin jeden Kurs", async () => {
    signInAs(u.admin);
    expect((await treeRoute(json("GET"), ctx({ certId: own.certId }))).status).toBe(200);
    expect((await treeRoute(json("GET"), ctx({ certId: other.certId }))).status).toBe(200);
    expect((await checkpointsRoute(json("GET"), ctx({ certId: own.certId }))).status).toBe(200);
  });
});
