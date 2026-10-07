/**
 * Lernpfade ohne Lektionstests („reine Absolvierung“): Lektion abschließen, Zuweisungsstatus durch Durcharbeiten, und
 * die Sperren für Tests, Übungssitzungen, Wiederholungen und Abschlussprüfung. Gegen eine ECHTE Postgres-Datenbank
 * (nur mit TEST_DATABASE_URL).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyAssignments,
  domains,
  lessonCompletions,
  lessons,
  objectiveProgress,
  objectives,
  organizationMemberships,
  organizations,
  sections,
  users,
} from "@/lib/server/db/schema";
import { POST as completePost } from "@/app/api/sections/[id]/complete/route";
import { POST as attemptPost } from "@/app/api/sections/[id]/attempt/route";
import { POST as startSession } from "@/app/api/study-sessions/start/route";
import { GET as remediationGet } from "@/app/api/remediation/[objectiveId]/route";
import { POST as examPost } from "@/app/api/exams/[certId]/route";
import { exportAccountData } from "@/lib/server/account/export";
import { syncAssignmentStatus } from "./sync";

const run = TEST_DB ? describe : describe.skip;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown = {}) => new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

run("Lernpfade ohne Tests: Abschluss durch Durcharbeiten und Sperren (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids = { users: [] as string[], orgs: [] as string[], certs: [] as string[] };
  const u: Record<string, string> = {};
  let orgA = "";
  const paths: Record<string, { cert: string; objective: string; sections: string[] }> = {};

  const as = (key: string | null) => authMock.mockResolvedValue(key ? { user: { id: u[key] } } : null);
  async function mkPath(key: string, flags: { quizzes: boolean; exam: boolean }) {
    const d = getDb();
    const [c] = await d.insert(certifications).values({
      slug: `lc-${key}-${tag}`, name: `LC ${key}`, provider: "T", examName: "T", examVersion: "1",
      kind: "internal", ownerOrganizationId: orgA, includeSectionQuizzes: flags.quizzes, includeFinalExam: flags.exam,
    }).returning();
    ids.certs.push(c.id);
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
    const [obj] = await d.insert(objectives).values({ domainId: dom.id, code: `O-${key}-${tag}`, title: "O" }).returning();
    const secs: string[] = [];
    for (const n of [1, 2]) {
      const [s] = await d.insert(sections).values({ objectiveId: obj.id, orderNum: n, title: { de: `S${n}`, en: `S${n}` } }).returning();
      await d.insert(lessons).values({ sectionId: s.id, content: { de: "x", en: "x" } });
      secs.push(s.id);
    }
    paths[key] = { cert: c.id, objective: obj.id, sections: secs };
    await d.insert(companyAssignments).values({ organizationId: orgA, userId: u.learner, certificationId: c.id });
  }
  const assignment = async (key: string) =>
    (await getDb().select().from(companyAssignments).where(and(eq(companyAssignments.userId, u.learner), eq(companyAssignments.certificationId, paths[key].cert))))[0];

  beforeAll(async () => {
    orgA = (await getDb().insert(organizations).values({ name: `LessonDone ${tag}` }).returning())[0].id;
    ids.orgs.push(orgA);
    for (const k of ["learner", "outsider"]) {
      const [x] = await getDb().insert(users).values({ email: `${k}-${tag}@test.example`, passwordHash: "x", name: k }).returning({ id: users.id });
      u[k] = x.id;
      ids.users.push(x.id);
    }
    await getDb().insert(organizationMemberships).values({ organizationId: orgA, userId: u.learner, role: "learner" });
    await mkPath("none", { quizzes: false, exam: false }); // reiner Durchlauf
    await mkPath("examOnly", { quizzes: false, exam: true });
    await mkPath("full", { quizzes: true, exam: true });
  });
  afterAll(async () => {
    await getDb().delete(certifications).where(inArray(certifications.id, ids.certs));
    await getDb().delete(organizations).where(inArray(organizations.id, ids.orgs));
    await getDb().delete(users).where(inArray(users.id, ids.users));
  });

  it("Lektion abschließen: nur angemeldet, unbekannt 404, mehrfach ändert nichts", async () => {
    as(null);
    expect((await completePost(post() as never, ctx(paths.none.sections[0]) as never)).status).toBe(401);
    as("learner");
    expect((await completePost(post() as never, ctx("kein-uuid") as never)).status).toBe(404);
    expect((await completePost(post() as never, ctx(randomUUID()) as never)).status).toBe(404);
    expect((await completePost(post() as never, ctx(paths.none.sections[0]) as never)).status).toBe(200);
    expect((await completePost(post() as never, ctx(paths.none.sections[0]) as never)).status).toBe(200);
    expect(await getDb().select().from(lessonCompletions).where(eq(lessonCompletions.userId, u.learner))).toHaveLength(1);
  });

  it("Zuweisung ohne Tests: eine von zwei Lektionen = in Arbeit, beide = abgeschlossen mit Datum, bleibt abgeschlossen", async () => {
    expect((await assignment("none")).status).toBe("in_progress");
    as("learner");
    expect((await completePost(post() as never, ctx(paths.none.sections[1]) as never)).status).toBe(200);
    const done = await assignment("none");
    expect(done.status).toBe("completed");
    expect(done.completedAt).not.toBeNull();
    // erneutes Nachziehen ändert nichts (auch nicht das Datum)
    await syncAssignmentStatus(u.learner, paths.none.cert, new Date("2030-01-01"));
    expect((await assignment("none")).completedAt?.getTime()).toBe(done.completedAt!.getTime());
  });

  it("Abschlussprüfung allein ist kein Abschlusskriterium: Lektionen genügen auch bei „nur Prüfung“", async () => {
    as("learner");
    await completePost(post() as never, ctx(paths.examOnly.sections[0]) as never);
    expect((await assignment("examOnly")).status).toBe("in_progress");
    await completePost(post() as never, ctx(paths.examOnly.sections[1]) as never);
    expect((await assignment("examOnly")).status).toBe("completed");
  });

  it("Lernpfad MIT Lektionstests: Durcharbeiten allein schließt nicht ab (es zählt das Beherrschen der Lernziele)", async () => {
    as("learner");
    for (const s of paths.full.sections) expect((await completePost(post() as never, ctx(s) as never)).status).toBe(200);
    expect((await assignment("full")).status).toBe("assigned"); // kein Fortschritt im Sinne der Lernziele
    await getDb().insert(objectiveProgress).values({ userId: u.learner, objectiveId: paths.full.objective, status: "STRONG", masteryScore: 90 } as never).catch(() => undefined);
  });

  it("Sperren: ohne Lektionstests keine Abschnittsquizze, Übungssitzungen und Wiederholungen; ohne Prüfung keine Abschlussprüfung", async () => {
    as("learner");
    const blockedBy = async (res: Response) => (res.status === 409 ? ((await res.json()).error as string) : `status ${res.status}`);
    expect(await blockedBy(await attemptPost(post({ answers: [] }) as never, ctx(paths.none.sections[0]) as never))).toMatch(/Lektionstests sind für diesen Lernpfad ausgeschaltet/);
    expect(await blockedBy(await attemptPost(post({ answers: [] }) as never, ctx(paths.examOnly.sections[0]) as never))).toMatch(/Lektionstests sind für diesen Lernpfad ausgeschaltet/);
    expect(await blockedBy(await attemptPost(post({ answers: [] }) as never, ctx(paths.full.sections[0]) as never))).not.toMatch(/ausgeschaltet/);
    for (const key of ["none", "examOnly"]) {
      expect(await blockedBy(await startSession(post({ certificationId: paths[key].cert, goalValue: 5, goalType: "questions" }) as never))).toMatch(/nur bei Lernpfaden mit Lektionstests/);
    }
    expect(await blockedBy(await remediationGet(new Request("http://x") as never, { params: Promise.resolve({ objectiveId: paths.none.objective }) } as never))).toMatch(/nur bei Lernpfaden mit Lektionstests/);
    expect(await blockedBy(await examPost(post() as never, { params: Promise.resolve({ certId: paths.none.cert }) } as never))).toMatch(/keine Abschlussprüfung/);
    // mit Prüfung: nicht durch den Schalter gesperrt (hier fehlen nur Fragen)
    expect(await blockedBy(await examPost(post() as never, { params: Promise.resolve({ certId: paths.full.cert }) } as never))).not.toMatch(/keine Abschlussprüfung/);
    expect(await blockedBy(await examPost(post() as never, { params: Promise.resolve({ certId: paths.examOnly.cert }) } as never))).not.toMatch(/keine Abschlussprüfung/);
  });

  it("Fremde sehen/ändern nichts: eine Person ohne Zugriff auf den Lernpfad bekommt 404", async () => {
    as("outsider");
    expect((await completePost(post() as never, ctx(paths.none.sections[0]) as never)).status).toBe(404);
    expect(await getDb().select().from(lessonCompletions).where(eq(lessonCompletions.userId, u.outsider))).toHaveLength(0);
  });

  it("Datenexport enthält die durchgearbeiteten Lektionen der Person", async () => {
    const data = await exportAccountData(u.learner);
    expect(data!.learning.lessonCompletions.length).toBeGreaterThanOrEqual(5);
    expect((await exportAccountData(u.outsider))!.learning.lessonCompletions).toHaveLength(0);
  });
});
