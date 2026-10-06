/**
 * Tests für das Zuweisen von Lernpfaden und die Statusnachführung (Phase 3) gegen eine ECHTE
 * Postgres-Datenbank. Wie company-access.test.ts nur mit TEST_DATABASE_URL, sonst übersprungen.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  auditEvents,
  certifications,
  companyAssignments,
  companyCourseEntitlements,
  domains,
  objectiveProgress,
  objectives,
  organizationMemberships,
  organizations,
  questions,
  quizAnswers,
  quizAttempts,
  quizzes,
  sections,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { GET as statusRoute } from "@/app/api/company/status/route";
import { POST as assignRoute } from "@/app/api/company/assignments/route";
import { DELETE as deleteRoute, PATCH as patchRoute } from "@/app/api/company/assignments/[id]/route";
import { ObjectiveProgressService } from "@/lib/server/progress/service";
import { listMyAssignments, syncAssignmentStatus } from "@/lib/server/assignments/sync";
import { parseDueDate, InvalidDueDateError } from "./assignments";

const run = TEST_DB ? describe : describe.skip;

const signInAs = (userId: string | null) => authMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
const jsonReq = (method: string, body: unknown) =>
  new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

describe("Fristen (ohne Datenbank)", () => {
  const now = new Date("2026-10-05T10:00:00Z");
  it("akzeptiert heute und später, leer = keine Frist", () => {
    expect(parseDueDate("2026-10-05", now)?.toISOString()).toBe("2026-10-05T23:59:59.999Z");
    expect(parseDueDate("2027-01-31", now)).not.toBeNull();
    expect(parseDueDate(null, now)).toBeNull();
    expect(parseDueDate("", now)).toBeNull();
  });
  it("lehnt Vergangenheit, falsches Format und unmögliche Daten ab", () => {
    for (const bad of ["2026-10-04", "05.10.2026", "2026-02-30", "2026-13-01", "morgen"]) {
      expect(() => parseDueDate(bad, now), bad).toThrow(InvalidDueDateError);
    }
  });
});

run("Lernpfade zuweisen und Status nachführen (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  let orgA = "";
  let orgB = "";
  let certId = "";
  let otherCertId = "";
  const objectiveIds: string[] = [];
  let quizId = "";

  async function makeUser(key: string) {
    const [u] = await getDb()
      .insert(users)
      .values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key })
      .returning({ id: users.id });
    ids[key] = u.id;
  }
  const addMember = (orgId: string, key: string, role: CompanyRole) =>
    getDb().insert(organizationMemberships).values({ organizationId: orgId, userId: ids[key], role });

  async function assign(asKey: string, body: Record<string, unknown>) {
    signInAs(ids[asKey]);
    return assignRoute(jsonReq("POST", body));
  }
  const rowsOf = (userKey: string) =>
    getDb().select().from(companyAssignments).where(eq(companyAssignments.userId, ids[userKey]));

  /** Beantwortet jedes Lernziel des Lernpfads n-mal und schreibt den Fortschritt über den echten Weg. */
  async function practice(userKey: string, objectiveIdsToDo: string[], correct: boolean, times = 3) {
    const db = getDb();
    for (const objectiveId of objectiveIdsToDo) {
      const [attempt] = await db
        .insert(quizAttempts)
        .values({ quizId, userId: ids[userKey], completedAt: new Date() })
        .returning({ id: quizAttempts.id });
      const qs = await db.select({ id: questions.id }).from(questions).where(eq(questions.objectiveId, objectiveId));
      for (let i = 0; i < times; i++) {
        await db.insert(quizAnswers).values({ quizAttemptId: attempt.id, questionId: qs[i % qs.length].id, isCorrect: correct });
      }
      await ObjectiveProgressService.updateProgressForQuizAttempt(ids[userKey], attempt.id);
    }
  }

  beforeAll(async () => {
    const db = getDb();
    const mkCert = async (suffix: string) =>
      (await db.insert(certifications).values({ slug: `pfad-${suffix}-${tag}`, name: `Pfad ${suffix} ${tag}`, provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id }))[0].id;
    certId = await mkCert("eins");
    otherCertId = await mkCert("zwei");
    const [dom] = await db.insert(domains).values({ certificationId: certId, orderNum: 1, name: "D" }).returning({ id: domains.id });
    for (const code of ["1.1", "1.2"]) {
      const [o] = await db.insert(objectives).values({ domainId: dom.id, code, title: `Ziel ${code}` }).returning({ id: objectives.id });
      objectiveIds.push(o.id);
      await db.insert(questions).values(
        [1, 2, 3].map((n) => ({
          humanId: `Q-${tag}-${code}-${n}`, objectiveId: o.id, difficulty: "intermediate", type: "single",
          question: { de: "F", en: "Q" }, explanation: { de: "E", en: "E" },
        })),
      );
    }
    const [sec] = await db.insert(sections).values({ objectiveId: objectiveIds[0], orderNum: 1, title: { de: "S", en: "S" } }).returning({ id: sections.id });
    quizId = (await db.insert(quizzes).values({ sectionId: sec.id, certificationId: certId }).returning({ id: quizzes.id }))[0].id;

    orgA = (await db.insert(organizations).values({ name: `A ${tag}` }).returning())[0].id;
    orgB = (await db.insert(organizations).values({ name: `B ${tag}` }).returning())[0].id;
    // Zuweisbar ist nur, was für die Firma freigegeben ist: A darf beide Lernpfade, B nur den ersten.
    await db.insert(companyCourseEntitlements).values([
      { organizationId: orgA, certificationId: certId },
      { organizationId: orgA, certificationId: otherCertId },
      { organizationId: orgB, certificationId: certId },
    ]);
    for (const k of ["adminA", "mentorA", "learnerA", "learnerA2", "adminB", "learnerB", "loner"]) await makeUser(k);
    await addMember(orgA, "adminA", "company_admin");
    await addMember(orgA, "mentorA", "mentor");
    await addMember(orgA, "learnerA", "learner");
    await addMember(orgA, "learnerA2", "learner");
    await addMember(orgB, "adminB", "company_admin");
    await addMember(orgB, "learnerB", "learner");
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
    await db.delete(certifications).where(inArray(certifications.id, [certId, otherCertId]));
  });
  beforeEach(() => authMock.mockReset());

  it("Zugriff: ohne Anmeldung 401, Lernende und Nutzer ohne Organisation 403", async () => {
    signInAs(null);
    expect((await assignRoute(jsonReq("POST", {}))).status).toBe(401);
    for (const k of ["learnerA", "loner"]) {
      const res = await assign(k, { userIds: [ids.learnerA], certificationId: certId });
      expect(res.status, k).toBe(403);
    }
    expect(await rowsOf("learnerA")).toHaveLength(0);
  });

  it("Firmen-Admin und Mentor weisen zu; Frist und Zuweiser werden gespeichert, Status startet als zugewiesen", async () => {
    const res = await assign("adminA", { userIds: [ids.learnerA, ids.learnerA2], certificationId: certId, dueAt: future(30) });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ assigned: expect.arrayContaining([ids.learnerA, ids.learnerA2]), alreadyAssigned: [] });
    const [row] = await rowsOf("learnerA");
    expect(row).toMatchObject({ organizationId: orgA, status: "assigned", assignedByUserId: ids.adminA, certificationId: certId });
    expect(row.dueAt?.toISOString().slice(0, 10)).toBe(future(30));

    const mentorRes = await assign("mentorA", { userIds: [ids.learnerA], certificationId: otherCertId });
    expect(mentorRes.status).toBe(201);
  });

  it("zweite Zuweisung ändert nichts (Frist bleibt) und meldet 'bereits zugewiesen'", async () => {
    const res = await assign("adminA", { userIds: [ids.learnerA], certificationId: certId, dueAt: future(90) });
    expect(res.status).toBe(201);
    expect((await res.json()).alreadyAssigned).toEqual([ids.learnerA]);
    const [row] = await getDb().select().from(companyAssignments).where(and(eq(companyAssignments.userId, ids.learnerA), eq(companyAssignments.certificationId, certId)));
    expect(row.dueAt?.toISOString().slice(0, 10)).toBe(future(30));
  });

  it("Mandantentrennung: Mitglieder anderer Firmen werden abgelehnt, und zwar alles oder nichts", async () => {
    const before = (await rowsOf("learnerA2")).length;
    const res = await assign("adminA", { userIds: [ids.learnerA2, ids.learnerB], certificationId: otherCertId });
    expect(res.status).toBe(400);
    expect((await rowsOf("learnerB"))).toHaveLength(0);
    expect((await rowsOf("learnerA2")).length).toBe(before); // auch die gültige Person wurde nicht zugewiesen
    // unbekannte Nutzer-ID verhält sich gleich (kein Hinweis, ob es die Person gibt)
    expect((await assign("adminA", { userIds: [randomUUID()], certificationId: certId })).status).toBe(400);
  });

  it("eine mitgeschickte organizationId wird ignoriert: es zählt nur die eigene Organisation", async () => {
    const res = await assign("adminB", { userIds: [ids.learnerB], certificationId: certId, organizationId: orgA });
    expect(res.status).toBe(201);
    const [row] = await rowsOf("learnerB");
    expect(row.organizationId).toBe(orgB);
  });

  it("ohne Freigabe nicht zuweisbar: Firma B darf den zweiten Lernpfad nicht, und auch nicht erfahren, dass es ihn gibt", async () => {
    const res = await assign("adminB", { userIds: [ids.learnerB], certificationId: otherCertId });
    expect(res.status).toBe(404);
    expect((await rowsOf("learnerB")).filter((r) => r.certificationId === otherCertId)).toHaveLength(0);
    const unknown = await assign("adminB", { userIds: [ids.learnerB], certificationId: randomUUID() });
    expect(unknown.status).toBe(404); // gleiche Antwort wie bei unbekanntem Lernpfad
    expect(await res.json()).toEqual(await unknown.json());
  });

  it("ungültige Anfragen: unbekannter Lernpfad 404, kaputter Body, Vergangenheit, leere Liste 400", async () => {
    expect((await assign("adminA", { userIds: [ids.learnerA], certificationId: randomUUID() })).status).toBe(404);
    expect((await assign("adminA", { userIds: [], certificationId: certId })).status).toBe(400);
    expect((await assign("adminA", { userIds: ["x"], certificationId: certId })).status).toBe(400);
    expect((await assign("adminA", { userIds: [ids.learnerA2], certificationId: certId, dueAt: "2020-01-01" })).status).toBe(400);
    expect((await assign("adminA", { userIds: [ids.learnerA2], certificationId: certId, dueAt: "kaputt" })).status).toBe(400);
    signInAs(ids.adminA);
    expect((await assignRoute(new Request("http://localhost/api", { method: "POST", body: "{" }))).status).toBe(400);
  });

  it("Statusansicht: jede Firma sieht nur ihre Zuweisungen, mit genau den freigegebenen Feldern", async () => {
    signInAs(ids.adminA);
    const a = await (await statusRoute()).json();
    expect(a.entries.length).toBeGreaterThanOrEqual(3);
    expect(a.entries.every((e: { memberEmail: string }) => e.memberEmail.endsWith(`-${tag}@test.example`) && !e.memberEmail.startsWith("learnerB"))).toBe(true);
    signInAs(ids.adminB);
    const b = await (await statusRoute()).json();
    expect(b.entries.map((e: { memberEmail: string }) => e.memberEmail)).toEqual([`learnerB-${tag}@test.example`]);
  });

  it("Frist ändern und Zuweisung entfernen: nur in der eigenen Firma (fremde: 404), Lernende 403", async () => {
    const [target] = await getDb().select().from(companyAssignments).where(and(eq(companyAssignments.userId, ids.learnerA2), eq(companyAssignments.certificationId, certId)));
    signInAs(ids.adminB);
    expect((await patchRoute(jsonReq("PATCH", { dueAt: future(10) }), ctx(target.id))).status).toBe(404);
    expect((await deleteRoute(jsonReq("DELETE", {}), ctx(target.id))).status).toBe(404);
    signInAs(ids.learnerA);
    expect((await patchRoute(jsonReq("PATCH", { dueAt: future(10) }), ctx(target.id))).status).toBe(403);
    expect((await deleteRoute(jsonReq("DELETE", {}), ctx(target.id))).status).toBe(403);

    signInAs(ids.mentorA);
    expect((await patchRoute(jsonReq("PATCH", { dueAt: future(10) }), ctx(target.id))).status).toBe(204);
    const [after] = await getDb().select().from(companyAssignments).where(eq(companyAssignments.id, target.id));
    expect(after.dueAt?.toISOString().slice(0, 10)).toBe(future(10));
    expect((await patchRoute(jsonReq("PATCH", { dueAt: null }), ctx(target.id))).status).toBe(204);
    expect((await patchRoute(jsonReq("PATCH", { dueAt: "2020-01-01" }), ctx(target.id))).status).toBe(400);
    expect((await patchRoute(jsonReq("PATCH", { dueAt: null }), ctx("kein-uuid"))).status).toBe(404);

    expect((await deleteRoute(jsonReq("DELETE", {}), ctx(target.id))).status).toBe(204);
    expect(await getDb().select().from(companyAssignments).where(eq(companyAssignments.id, target.id))).toHaveLength(0);
    expect((await deleteRoute(jsonReq("DELETE", {}), ctx(target.id))).status).toBe(404);
  });

  it("Fortschritt über den echten Lernweg: Üben -> in Arbeit, alle Ziele beherrscht -> abgeschlossen (mit Datum)", async () => {
    const mine = async () => (await rowsOf("learnerA")).find((r) => r.certificationId === certId)!;
    expect((await mine()).status).toBe("assigned");

    // schwach üben (falsch beantwortet): Fortschritt vorhanden, aber nicht beherrscht
    await practice("learnerA", [objectiveIds[0]], false);
    expect((await mine()).status).toBe("in_progress");
    expect((await mine()).completedAt).toBeNull();

    // erstes Ziel beherrscht, zweites noch nie geübt: noch nicht abgeschlossen
    await practice("learnerA", [objectiveIds[0]], true, 20);
    await getDb().update(objectiveProgress).set({ status: "STRONG" }).where(eq(objectiveProgress.userId, ids.learnerA));
    expect((await mine()).status).toBe("in_progress");

    // zweites Ziel geübt, aber falsch beantwortet: alle Ziele geübt, aber nicht alle beherrscht -> weiter in Arbeit
    await practice("learnerA", [objectiveIds[1]], false);
    expect((await mine()).status).toBe("in_progress");

    // zweites Ziel gut geübt: jetzt sind alle Ziele beherrscht
    await practice("learnerA", [objectiveIds[1]], true, 20);
    const done = await mine();
    expect(done.status).toBe("completed");
    expect(done.completedAt).not.toBeNull();
    // anderer Lernpfad derselben Person bleibt unberührt, andere Person ebenso
    expect((await rowsOf("learnerA")).find((r) => r.certificationId === otherCertId)!.status).toBe("assigned");
    expect((await rowsOf("learnerB"))[0].status).toBe("assigned");
  });

  it("abgeschlossen bleibt abgeschlossen und ist weder änderbar noch entfernbar", async () => {
    const done = (await rowsOf("learnerA")).find((r) => r.certificationId === certId)!;
    await getDb().update(objectiveProgress).set({ status: "LEARNING" }).where(eq(objectiveProgress.userId, ids.learnerA));
    await syncAssignmentStatus(ids.learnerA, certId);
    expect((await rowsOf("learnerA")).find((r) => r.id === done.id)!.status).toBe("completed");
    signInAs(ids.adminA);
    expect((await patchRoute(jsonReq("PATCH", { dueAt: null }), ctx(done.id))).status).toBe(404);
    expect((await deleteRoute(jsonReq("DELETE", {}), ctx(done.id))).status).toBe(404);
  });

  it("Üben ohne Zuweisung ändert nichts und stört nicht", async () => {
    await practice("learnerA2", [objectiveIds[0]], true);
    expect((await rowsOf("learnerA2")).filter((r) => r.certificationId === certId)).toHaveLength(0);
  });

  it("Lernende sehen ihre eigenen Zuweisungen mit Firmennamen, nie die anderer", async () => {
    const mine = await listMyAssignments(ids.learnerA);
    expect(mine.length).toBe(2);
    expect(mine.every((m) => m.organizationName === `A ${tag}`)).toBe(true);
    expect(await listMyAssignments(ids.loner)).toEqual([]);
  });

  it("Audit: Zuweisen, Friständerung und Entfernen sind protokolliert", async () => {
    const events = await getDb().select().from(auditEvents).where(inArray(auditEvents.actorUserId, [ids.adminA, ids.mentorA]));
    const actions = new Set(events.map((e) => e.action));
    expect(actions).toContain("assignment.created");
    expect(actions).toContain("assignment.due_changed");
    expect(actions).toContain("assignment.removed");
  });
});
