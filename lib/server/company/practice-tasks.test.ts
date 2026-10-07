/**
 * Praxisaufgaben (anlegen, abgeben, bestätigen) gegen eine ECHTE Postgres-Datenbank (nur mit TEST_DATABASE_URL).
 * Geprüft wird vor allem, was nicht passieren darf: fremde Firmen, Personen ohne den Lernpfad, Bestätigung der
 * eigenen Abgabe, Änderung bestätigter Abgaben und mehr Daten in der Statusansicht als „x von y bestätigt“.
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
  organizationMemberships,
  organizations,
  practiceTaskSubmissions,
  practiceTasks,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { GET as manageGet, POST as createPost } from "@/app/api/company/practice-tasks/route";
import { GET as mineGet } from "@/app/api/company/practice-tasks/mine/route";
import { DELETE as archiveDelete } from "@/app/api/company/practice-tasks/[id]/route";
import { POST as submitPost } from "@/app/api/company/practice-tasks/[id]/submit/route";
import { POST as reviewPost } from "@/app/api/company/practice-tasks/submissions/[id]/review/route";
import { exportAccountData } from "@/lib/server/account/export";
import { listCompanyStatus } from "./status";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (id: string | null) => authMock.mockResolvedValue(id ? { user: { id } } : null);
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

run("Praxisaufgaben (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  const certIds: Record<string, string> = {};
  let orgA = "";
  let orgB = "";

  async function mkUser(key: string) {
    const [u] = await getDb().insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key }).returning({ id: users.id });
    ids[key] = u.id;
  }
  const member = (org: string, key: string, role: CompanyRole) => getDb().insert(organizationMemberships).values({ organizationId: org, userId: ids[key], role });
  async function mkCert(key: string, extra: Partial<typeof certifications.$inferInsert> = {}) {
    const [c] = await getDb().insert(certifications).values({ slug: `pt-${key}-${tag}`, name: `PT ${key} ${tag}`, provider: "T", examName: "T", examVersion: "1", ...extra }).returning({ id: certifications.id });
    certIds[key] = c.id;
  }
  const assign = (org: string, key: string, cert: string) => getDb().insert(companyAssignments).values({ organizationId: org, userId: ids[key], certificationId: certIds[cert] });
  async function createTask(as: string, cert: string, title = "Setze einen Testserver auf") {
    signInAs(ids[as]);
    const res = await createPost(req("POST", { certificationId: certIds[cert], title, description: "Mit Anleitung aus dem Handbuch." }));
    return { status: res.status, id: res.status === 201 ? ((await res.json()).id as string) : "" };
  }
  async function submit(as: string, taskId: string, note?: string) {
    signInAs(ids[as]);
    return submitPost(req("POST", note === undefined ? {} : { note }), ctx(taskId) as never);
  }
  async function review(as: string, submissionId: string, decision: "confirm" | "rework", note?: string) {
    signInAs(ids[as]);
    return reviewPost(req("POST", { decision, note }), ctx(submissionId) as never);
  }
  const submissionOf = async (taskId: string, key: string) =>
    (await getDb().select().from(practiceTaskSubmissions).where(and(eq(practiceTaskSubmissions.taskId, taskId), eq(practiceTaskSubmissions.userId, ids[key]))))[0];
  const mine = async (as: string) => {
    signInAs(ids[as]);
    return (await (await mineGet()).json()).tasks as { taskId: string; status: string; note: string | null; reviewerNote: string | null }[];
  };

  beforeAll(async () => {
    orgA = (await getDb().insert(organizations).values({ name: `PtA ${tag}` }).returning())[0].id;
    orgB = (await getDb().insert(organizations).values({ name: `PtB ${tag}` }).returning())[0].id;
    for (const k of ["adminA", "mentorA", "mentorA2", "learnerA", "learnerA2", "learnerNoPath", "adminB", "learnerB", "loner"]) await mkUser(k);
    await member(orgA, "adminA", "company_admin");
    await member(orgA, "mentorA", "mentor");
    await member(orgA, "mentorA2", "mentor");
    await member(orgA, "learnerA", "learner");
    await member(orgA, "learnerA2", "learner");
    await member(orgA, "learnerNoPath", "learner");
    await member(orgB, "adminB", "company_admin");
    await member(orgB, "learnerB", "learner");
    await mkCert("security"); // allgemein, für A freigegeben
    await mkCert("unreleased"); // allgemein, NICHT für A freigegeben
    await mkCert("draft", { catalogStatus: "draft" });
    await mkCert("internA", { kind: "internal", ownerOrganizationId: orgA });
    await mkCert("internB", { kind: "internal", ownerOrganizationId: orgB });
    await getDb().insert(companyCourseEntitlements).values({ organizationId: orgA, certificationId: certIds.security });
    await assign(orgA, "learnerA", "security");
    await assign(orgA, "learnerA2", "security");
    await assign(orgA, "mentorA", "security"); // der Mentor lernt selbst mit
    await assign(orgB, "learnerB", "internB");
  });
  afterAll(async () => {
    await getDb().delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await getDb().delete(certifications).where(inArray(certifications.id, Object.values(certIds)));
    await getDb().delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  it("Zugriff: Verwaltung nur Mentor und Firmen-Admin, „meine“ alle Rollen, ohne Firma und ohne Anmeldung nichts", async () => {
    signInAs(null);
    expect((await manageGet()).status).toBe(401);
    expect((await mineGet()).status).toBe(401);
    for (const k of ["learnerA", "loner", "learnerB"]) {
      signInAs(ids[k]);
      expect((await manageGet()).status, k).toBe(403);
      expect((await createPost(req("POST", { certificationId: certIds.security, title: "Aufgabe" }))).status, k).toBe(403);
    }
    signInAs(ids.loner);
    expect((await mineGet()).status).toBe(403);
    for (const k of ["adminA", "mentorA", "learnerA"]) {
      signInAs(ids[k]);
      expect((await mineGet()).status, k).toBe(200);
    }
    for (const k of ["adminA", "mentorA"]) {
      signInAs(ids[k]);
      expect((await manageGet()).status, k).toBe(200);
    }
  });

  let task = "";
  it("Anlegen: nur zu Lernpfaden, die die Firma zuweisen darf; ungültige Eingaben 400", async () => {
    const ok = await createTask("mentorA", "security");
    expect(ok.status).toBe(201);
    task = ok.id;
    expect((await createTask("adminA", "internA", "Interne Übung")).status).toBe(201);
    for (const cert of ["unreleased", "draft", "internB"]) expect((await createTask("adminA", cert)).status, cert).toBe(404);
    signInAs(ids.adminA);
    expect((await createPost(req("POST", { certificationId: certIds.security, title: "ab" }))).status).toBe(400);
    expect((await createPost(req("POST", { certificationId: certIds.security, title: "x".repeat(201) }))).status).toBe(400);
    expect((await createPost(req("POST", { certificationId: certIds.security, title: "Gut", description: "x".repeat(2001) }))).status).toBe(400);
    expect((await createPost(req("POST", { certificationId: "kein-uuid", title: "Gut" }))).status).toBe(400);
    expect((await getDb().select().from(practiceTasks).where(eq(practiceTasks.organizationId, orgA)))).toHaveLength(2);
  });

  it("Sichtbarkeit: nur wer den Lernpfad zugewiesen hat, sieht die Aufgabe; andere Firmen nie", async () => {
    for (const k of ["learnerA", "learnerA2", "mentorA"]) expect((await mine(k)).map((t) => t.taskId), k).toContain(task);
    for (const k of ["learnerNoPath", "adminA", "learnerB", "adminB"]) expect((await mine(k)).map((t) => t.taskId), k).not.toContain(task);
    expect((await mine("learnerA")).find((t) => t.taskId === task)).toMatchObject({ status: "open", note: null });
    // andere Firma sieht die Verwaltung nicht
    signInAs(ids.adminB);
    const b = await (await manageGet()).json();
    expect(b.tasks).toHaveLength(0);
  });

  it("Abgabe: nur mit zugewiesenem Lernpfad; Notiz begrenzt; erscheint beim Mentor als wartend", async () => {
    expect((await submit("learnerNoPath", task)).status).toBe(404);
    expect((await submit("learnerB", task)).status).toBe(404);
    expect((await submit("adminB", task)).status).toBe(404);
    expect((await submit("learnerA", task, "x".repeat(1101))).status).toBe(400);
    expect((await submit("learnerA", randomUUID())).status).toBe(404);
    expect((await submit("learnerA", "kein-uuid")).status).toBe(404);
    expect((await submit("learnerA", task, "Server läuft, Screenshot liegt im Wiki")).status).toBe(200);
    expect((await submit("learnerA", task, "Server läuft (überarbeitet)")).status).toBe(200); // Notiz ändern, solange offen
    expect((await mine("learnerA")).find((t) => t.taskId === task)).toMatchObject({ status: "submitted", note: "Server läuft (überarbeitet)" });
    expect(await getDb().select().from(practiceTaskSubmissions).where(eq(practiceTaskSubmissions.taskId, task))).toHaveLength(1);

    signInAs(ids.mentorA);
    const data = await (await manageGet()).json();
    const pending = data.pending.find((p: { memberEmail: string }) => p.memberEmail === `learnerA-${tag}@test.example`);
    expect(pending).toMatchObject({ note: "Server läuft (überarbeitet)", taskTitle: "Setze einen Testserver auf" });
    expect(data.tasks.find((t: { id: string }) => t.id === task)).toMatchObject({ assignees: 3, submitted: 1, confirmed: 0 });
    // andere Firma sieht diese Abgabe nicht
    signInAs(ids.adminB);
    expect((await (await manageGet()).json()).pending).toHaveLength(0);
  });

  let subA = "";
  it("Prüfung: Lernende und fremde Firma scheitern, Nacharbeit braucht einen Hinweis, die eigene Abgabe bestätigt niemand selbst", async () => {
    subA = (await submissionOf(task, "learnerA")).id;
    expect((await review("learnerA2", subA, "confirm")).status).toBe(403);
    expect((await review("adminB", subA, "confirm")).status).toBe(404);
    signInAs(null);
    expect((await reviewPost(req("POST", { decision: "confirm" }), ctx(subA) as never)).status).toBe(401);
    expect((await review("mentorA", "kein-uuid", "confirm")).status).toBe(404);
    expect((await review("mentorA", randomUUID(), "confirm")).status).toBe(404);
    expect((await review("mentorA", subA, "rework")).status).toBe(400); // ohne Hinweis
    signInAs(ids.mentorA);
    expect((await reviewPost(req("POST", { decision: "vielleicht" }), ctx(subA) as never)).status).toBe(400);
    expect((await submissionOf(task, "learnerA")).status).toBe("submitted");

    // der Mentor lernt selbst mit und gibt ab: bestätigen darf eine ANDERE Person
    expect((await submit("mentorA", task, "Meine eigene Abgabe")).status).toBe(200);
    const own = (await submissionOf(task, "mentorA")).id;
    expect((await review("mentorA", own, "confirm")).status).toBe(403);
    expect((await submissionOf(task, "mentorA")).status).toBe("submitted");
    expect((await review("mentorA2", own, "confirm")).status).toBe(200);
  });

  it("Nacharbeit: Hinweis sichtbar für die Person, erneute Abgabe löscht den Hinweis, Bestätigung ist endgültig", async () => {
    expect((await review("mentorA", subA, "rework", "Bitte den Port in der Doku ergänzen")).status).toBe(200);
    expect(await mine("learnerA").then((t) => t.find((x) => x.taskId === task))).toMatchObject({ status: "rework", reviewerNote: "Bitte den Port in der Doku ergänzen" });
    expect((await review("mentorA", subA, "confirm")).status).toBe(409); // wartet auf die Person, nicht auf Prüfung

    expect((await submit("learnerA", task, "Port ergänzt")).status).toBe(200);
    const again = await submissionOf(task, "learnerA");
    expect(again).toMatchObject({ status: "submitted", reviewerNote: null, reviewedAt: null, reviewedByUserId: null });
    expect((await review("adminA", subA, "confirm", "Sieht gut aus")).status).toBe(200);
    expect(await submissionOf(task, "learnerA")).toMatchObject({ status: "confirmed", reviewedByUserId: ids.adminA, reviewerNote: "Sieht gut aus" });

    expect((await submit("learnerA", task, "nachträglich ändern")).status).toBe(409);
    expect((await review("mentorA", subA, "rework", "doch nicht")).status).toBe(409);
    expect((await submissionOf(task, "learnerA")).status).toBe("confirmed");
    const audit = await getDb().select().from(auditEvents).where(and(eq(auditEvents.targetId, subA)));
    expect(audit.map((a) => a.action).sort()).toEqual(["practice_task.confirmed", "practice_task.rework_requested"]);
  });

  it("Statusansicht der Firma: nur „x von y bestätigt“ je Zuweisung, keine Inhalte", async () => {
    // abgegeben, aber noch nicht bestätigt, zählt nicht
    expect((await submit("learnerA2", task, "fast fertig")).status).toBe(200);
    const rows = await listCompanyStatus(orgA);
    const of = (key: string) => rows.find((r) => r.memberId === ids[key])!;
    expect(of("learnerA")).toMatchObject({ practiceTotal: 1, practiceConfirmed: 1 });
    expect(of("learnerA2")).toMatchObject({ practiceTotal: 1, practiceConfirmed: 0 });
    expect(of("mentorA")).toMatchObject({ practiceTotal: 1, practiceConfirmed: 1 });
    expect(JSON.stringify(rows)).not.toContain("Port");
    expect(JSON.stringify(rows)).not.toContain("Server läuft");
  });

  it("Datenexport der Person enthält ihre Abgaben samt Bestätigung", async () => {
    const data = await exportAccountData(ids.learnerA);
    expect(data!.company.practiceSubmissions).toEqual([
      expect.objectContaining({ task: "Setze einen Testserver auf", status: "confirmed", note: "Port ergänzt", reviewerNote: "Sieht gut aus" }),
    ]);
    expect((await exportAccountData(ids.learnerNoPath))!.company.practiceSubmissions).toHaveLength(0);
  });

  it("Archivieren: nur eigene Firma, Aufgabe verschwindet aus Listen und Zählern, Abgaben bleiben erhalten", async () => {
    signInAs(ids.adminB);
    expect((await archiveDelete(req("DELETE"), ctx(task) as never)).status).toBe(404);
    signInAs(ids.learnerA);
    expect((await archiveDelete(req("DELETE"), ctx(task) as never)).status).toBe(403);
    signInAs(ids.adminA);
    expect((await archiveDelete(req("DELETE"), ctx("kein-uuid") as never)).status).toBe(404);
    expect((await archiveDelete(req("DELETE"), ctx(task) as never)).status).toBe(200);
    expect((await archiveDelete(req("DELETE"), ctx(task) as never)).status).toBe(404); // schon archiviert

    expect((await mine("learnerA")).map((t) => t.taskId)).not.toContain(task);
    expect((await submit("learnerA2", task)).status).toBe(404);
    expect((await review("mentorA", subA, "rework", "zu spät")).status).toBe(404);
    expect((await listCompanyStatus(orgA)).find((r) => r.memberId === ids.learnerA)).toMatchObject({ practiceTotal: 0, practiceConfirmed: 0 });
    expect(await getDb().select().from(practiceTaskSubmissions).where(eq(practiceTaskSubmissions.taskId, task))).toHaveLength(3);
  });

  it("Mitglied verlassen: die Abgaben der Person fallen mit der Mitgliedschaft weg, die Aufgabe bleibt", async () => {
    const fresh = (await createTask("adminA", "security", "Nochmal prüfen")).id;
    expect((await submit("learnerA2", fresh, "fertig")).status).toBe(200);
    await getDb().delete(organizationMemberships).where(eq(organizationMemberships.userId, ids.learnerA2));
    expect(await getDb().select().from(practiceTaskSubmissions).where(eq(practiceTaskSubmissions.userId, ids.learnerA2))).toHaveLength(0);
    expect(await getDb().select().from(practiceTasks).where(eq(practiceTasks.id, fresh))).toHaveLength(1);
  });
});
