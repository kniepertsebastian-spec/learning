/**
 * Pflichtschulungen, Teil 2 (echte DB + SMTP-Testserver): Abteilungen, Wirkung bei Wechsel von Rolle/Abteilung
 * (Entscheidung je Regel) und Wiederholung mit Statusrücksetzung („Runden“): Warnung bestätigen, neue Runde nach
 * X Monaten, Nachweise früherer Runden zählen nicht mehr.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { and, eq, inArray } from "drizzle-orm";
import type { ParsedMail } from "mailparser";
import { getDb } from "@/lib/server/db/client";
import {
  assignmentNotices, certifications, companyAssignments, companyCourseEntitlements, departments, domains, lessonCompletions, lessons, mandatoryRules,
  objectiveProgress, objectives, organizationMemberships, organizations, sections, users, type CompanyRole,
} from "@/lib/server/db/schema";
import { POST as ruleCreate } from "@/app/api/company/mandatory/route";
import { GET as depList, POST as depCreate } from "@/app/api/company/departments/route";
import { DELETE as depDelete } from "@/app/api/company/departments/[id]/route";
import { PUT as depMember } from "@/app/api/company/department-members/[userId]/route";
import { POST as completePost } from "@/app/api/sections/[id]/complete/route";
import { applyRulesForMember, runMandatoryMaintenance, startDueRepeats } from "./mandatory";
import { syncAssignmentStatus } from "@/lib/server/assignments/sync";
import { startSmtpSink, useSmtpSinkEnv, type SmtpSink } from "@/lib/server/mail/test-smtp";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (id: string | null) => authMock.mockResolvedValue(id ? { user: { id } } : null);
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const DAY = 86_400_000;
const monthsAfter = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
};

run("Pflichtschulungen: Abteilungen, Wechsel und Wiederholung (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const mail = (key: string) => `${key}-${tag}@test.example`;
  const ids: Record<string, string> = {};
  const certIds: Record<string, string> = {};
  const dep: Record<string, string> = {};
  let orgC = "";
  let orgD = "";
  let sink: SmtpSink;
  let restoreEnv: () => void;
  const t0 = new Date();

  const addressesOf = (m: ParsedMail) => {
    const to = m.to as { value: { address: string }[] } | { value: { address: string }[] }[] | undefined;
    return (Array.isArray(to) ? to : to ? [to] : []).flatMap((a) => a.value.map((v) => v.address));
  };
  async function mkUser(key: string) {
    const [u] = await getDb().insert(users).values({ email: mail(key), passwordHash: "x", name: key, emailVerifiedAt: new Date() }).returning({ id: users.id });
    ids[key] = u.id;
  }
  const member = (org: string, key: string, role: CompanyRole, departmentId?: string) =>
    getDb().insert(organizationMemberships).values({ organizationId: org, userId: ids[key], role, departmentId });
  const assignment = async (key: string, cert: string) =>
    (await getDb().select().from(companyAssignments).where(eq(companyAssignments.userId, ids[key]))).find((a) => a.certificationId === certIds[cert]);
  async function rule(as: string, cert: string, over: Record<string, unknown> = {}) {
    signInAs(ids[as]);
    const res = await ruleCreate(req("POST", { certificationId: certIds[cert], roles: ["learner"], dueInDays: 30, ...over }));
    return { status: res.status, body: await res.json() };
  }
  async function mkCourse(key: string, quizzes: boolean) {
    const d = getDb();
    const [c] = await d.insert(certifications).values({ slug: `pr-${key}-${tag}`, name: `PR ${key} ${tag}`, provider: "T", examName: "T", examVersion: "1", includeSectionQuizzes: quizzes }).returning({ id: certifications.id });
    certIds[key] = c.id;
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
    const [obj] = await d.insert(objectives).values({ domainId: dom.id, code: `O-${key}-${tag}`, title: "O" }).returning();
    const [s] = await d.insert(sections).values({ objectiveId: obj.id, orderNum: 1, title: { de: "S", en: "S" } }).returning();
    await d.insert(lessons).values({ sectionId: s.id, content: { de: "x", en: "x" } });
    await d.insert(companyCourseEntitlements).values({ organizationId: orgC, certificationId: c.id });
    return { objectiveId: obj.id, sectionId: s.id };
  }
  const course: Record<string, { objectiveId: string; sectionId: string }> = {};

  beforeAll(async () => {
    sink = await startSmtpSink();
    restoreEnv = useSmtpSinkEnv(sink.port);
    const d = getDb();
    orgC = (await d.insert(organizations).values({ name: `RepC ${tag}` }).returning())[0].id;
    orgD = (await d.insert(organizations).values({ name: `RepD ${tag}` }).returning())[0].id;
    for (const k of ["adminC", "mentorC", "opsC", "devC", "freeC", "mover", "lessonsL", "quizL", "adminD", "learnerD"]) await mkUser(k);
    for (const k of ["Ops", "Dev"]) dep[k] = (await d.insert(departments).values({ organizationId: orgC, name: k }).returning())[0].id;
    dep.OtherOrg = (await d.insert(departments).values({ organizationId: orgD, name: "Fremd" }).returning())[0].id;
    await member(orgC, "adminC", "company_admin");
    await member(orgC, "mentorC", "mentor", dep.Ops);
    await member(orgC, "opsC", "learner", dep.Ops);
    await member(orgC, "devC", "learner", dep.Dev);
    await member(orgC, "freeC", "learner");
    await member(orgC, "mover", "learner");
    await member(orgC, "lessonsL", "learner");
    await member(orgC, "quizL", "learner");
    await member(orgD, "adminD", "company_admin");
    await member(orgD, "learnerD", "learner");
    for (const [k, q] of [["secDep", true], ["secNoChange", true], ["repLessons", false], ["repQuiz", true]] as const) course[k] = await mkCourse(k, q);
  });
  afterAll(async () => {
    restoreEnv();
    await sink.close();
    await getDb().delete(organizations).where(inArray(organizations.id, [orgC, orgD]));
    await getDb().delete(certifications).where(inArray(certifications.id, Object.values(certIds)));
    await getDb().delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  it("Abteilungen verwalten: nur Firmen-Admin; Name geprüft; doppelt 409; fremde Firma nicht auffindbar", async () => {
    signInAs(ids.mentorC);
    expect((await depList()).status).toBe(200);
    expect((await depCreate(req("POST", { name: "Neu" }))).status).toBe(403);
    signInAs(ids.adminC);
    expect((await depCreate(req("POST", { name: "x" }))).status).toBe(400);
    expect((await depCreate(req("POST", { name: "Ops" }))).status).toBe(409);
    const made = await depCreate(req("POST", { name: "Support" }));
    expect(made.status).toBe(201);
    const id = (await made.json()).id as string;
    const list = await (await depList()).json();
    expect(list.departments.map((x: { name: string }) => x.name)).toEqual(["Dev", "Ops", "Support"]);
    expect(list.members.find((m: { userId: string }) => m.userId === ids.opsC).departmentId).toBe(dep.Ops);
    // fremde Firma: sieht nichts, kann nicht löschen oder zuordnen
    signInAs(ids.adminD);
    expect((await (await depList()).json()).departments.map((x: { name: string }) => x.name)).toEqual(["Fremd"]);
    expect((await depDelete(req("DELETE"), { params: Promise.resolve({ id }) } as never)).status).toBe(404);
    expect((await depMember(req("PUT", { departmentId: dep.Ops }), { params: Promise.resolve({ userId: ids.learnerD }) } as never)).status).toBe(404);
    signInAs(ids.adminC);
    expect((await depMember(req("PUT", { departmentId: dep.OtherOrg }), { params: Promise.resolve({ userId: ids.mover }) } as never)).status).toBe(404);
    expect((await depMember(req("PUT", { departmentId: null }), { params: Promise.resolve({ userId: ids.learnerD }) } as never)).status).toBe(404);
    expect((await depDelete(req("DELETE"), { params: Promise.resolve({ id }) } as never)).status).toBe(200);
  });

  it("Regel nur für eine Abteilung: nur deren Mitglieder; fremde Abteilung 404", async () => {
    expect((await rule("adminC", "secDep", { departmentIds: [dep.OtherOrg] })).status).toBe(404);
    const r = await rule("adminC", "secDep", { departmentIds: [dep.Ops] });
    expect(r.status).toBe(201);
    expect(r.body.assigned).toBe(1); // opsC (mentorC ist in Ops, aber Mentor)
    expect(await assignment("opsC", "secDep")).toBeDefined();
    for (const k of ["devC", "freeC", "mover", "mentorC"]) expect(await assignment(k, "secDep"), k).toBeUndefined();
  });

  it("Wechsel der Abteilung: greift, wenn die Regel es vorsieht; sonst nicht (freie Entscheidung je Regel)", async () => {
    const noChange = await rule("adminC", "secNoChange", { departmentIds: [dep.Ops], applyOnChange: false });
    expect(noChange.status).toBe(201);
    signInAs(ids.adminC);
    const res = await depMember(req("PUT", { departmentId: dep.Ops }), { params: Promise.resolve({ userId: ids.mover }) } as never);
    expect(res.status).toBe(200);
    expect((await res.json()).assigned).toBe(1);
    expect(await assignment("mover", "secDep")).toBeDefined(); // Regel mit applyOnChange (Standard)
    expect(await assignment("mover", "secNoChange")).toBeUndefined(); // Regel ohne
    // gleiche Abteilung noch einmal: nichts Neues
    expect((await (await depMember(req("PUT", { departmentId: dep.Ops }), { params: Promise.resolve({ userId: ids.mover }) } as never)).json()).assigned).toBe(0);
    // Rollenwechsel (Skript-Weg): reason "change" beachtet applyOnChange genauso, "join" immer
    expect(await applyRulesForMember(orgC, ids.mover, "change")).toBe(0);
    expect(await applyRulesForMember(orgC, ids.mover, "join")).toBe(1); // secNoChange kommt jetzt
    expect(await assignment("mover", "secNoChange")).toBeDefined();
  });

  it("Abteilung löschen: Regel nur für diese Abteilung gilt für niemanden mehr, nie für alle", async () => {
    signInAs(ids.adminC);
    const made = await depCreate(req("POST", { name: "Temp" }));
    const tempId = (await made.json()).id as string;
    const r = await rule("adminC", "repQuiz", { departmentIds: [tempId], repeatEveryMonths: null });
    expect(r.status).toBe(201);
    await getDb().delete(companyAssignments).where(eq(companyAssignments.certificationId, certIds.repQuiz));
    signInAs(ids.adminC);
    expect((await depDelete(req("DELETE"), { params: Promise.resolve({ id: tempId }) } as never)).status).toBe(200);
    expect(await applyRulesForMember(orgC, ids.quizL, "join")).toBe(0);
    expect(await assignment("quizL", "repQuiz")).toBeUndefined();
    // Aufräumen für den Wiederholungstest
    await getDb().delete(mandatoryRules).where(eq(mandatoryRules.certificationId, certIds.repQuiz));
  });

  it("Wiederholung braucht die bestätigte Warnung und sinnvolle Monate", async () => {
    const noConfirm = await rule("adminC", "repLessons", { repeatEveryMonths: 12 });
    expect(noConfirm.status).toBe(400);
    expect(noConfirm.body.code).toBe("confirm_repeat_reset");
    expect((await rule("adminC", "repLessons", { repeatEveryMonths: 12, confirmRepeatReset: false })).status).toBe(400);
    expect((await rule("adminC", "repLessons", { repeatEveryMonths: 0, confirmRepeatReset: true })).status).toBe(400);
    expect((await rule("adminC", "repLessons", { repeatEveryMonths: 61, confirmRepeatReset: true })).status).toBe(400);
    expect(await assignment("lessonsL", "repLessons")).toBeUndefined();
  });

  it("Wiederholung (ohne Lektionstests): nach X Monaten neue Runde mit zurückgesetztem Status; alte Nachweise zählen nicht, neue schon", async () => {
    const r = await rule("adminC", "repLessons", { repeatEveryMonths: 6, confirmRepeatReset: true, dueInDays: 30 });
    expect(r.status).toBe(201);
    // Runde 1: Lektion durcharbeiten → abgeschlossen
    signInAs(ids.lessonsL);
    expect((await completePost(req("POST") as never, { params: Promise.resolve({ id: course.repLessons.sectionId }) } as never)).status).toBe(200);
    const done = await assignment("lessonsL", "repLessons");
    expect(done).toMatchObject({ status: "completed", round: 1, lastCompletedAt: null });

    // zu früh: nichts
    expect(await startDueRepeats(monthsAfter(t0, 5), [orgC, orgD])).toHaveLength(0);
    expect((await assignment("lessonsL", "repLessons"))!.status).toBe("completed");

    // nach 7 Monaten: neue Runde
    const later = monthsAfter(t0, 7);
    await getDb().insert(assignmentNotices).values({ assignmentId: done!.id, kind: "reminder" });
    const result = await runMandatoryMaintenance(later, { organizationIds: [orgC, orgD] });
    expect(result.repeats).toBeGreaterThanOrEqual(1);
    const second = (await assignment("lessonsL", "repLessons"))!;
    expect(second).toMatchObject({ status: "assigned", round: 2, completedAt: null });
    expect(second.lastCompletedAt!.getTime()).toBe(done!.completedAt!.getTime());
    expect(Math.round((second.dueAt!.getTime() - later.getTime()) / DAY)).toBe(30);
    expect(await getDb().select().from(assignmentNotices).where(eq(assignmentNotices.assignmentId, done!.id))).toHaveLength(0);
    await new Promise((r2) => setTimeout(r2, 300));
    expect(sink.messages.filter((m) => addressesOf(m).includes(mail("lessonsL")) && (m.subject ?? "").includes("Wiederholung fällig")).length).toBe(1);

    // die alte Markierung zählt nicht: auch ein Nachziehen macht die neue Runde nicht fertig
    await syncAssignmentStatus(ids.lessonsL, certIds.repLessons, later);
    expect((await assignment("lessonsL", "repLessons"))!.status).toBe("assigned");
    // erneut durcharbeiten (Zeitpunkt wird aufgefrischt) → neue Runde abgeschlossen
    await getDb().update(lessonCompletions).set({ completedAt: new Date(later.getTime() + 1000) }).where(and(eq(lessonCompletions.userId, ids.lessonsL)));
    await syncAssignmentStatus(ids.lessonsL, certIds.repLessons, new Date(later.getTime() + 2000));
    expect((await assignment("lessonsL", "repLessons"))).toMatchObject({ status: "completed", round: 2 });
    // und nicht doppelt zurückgesetzt, solange die Zeit nicht um ist
    expect(await startDueRepeats(monthsAfter(later, 3), [orgC, orgD])).toHaveLength(0);
  });

  it("Wiederholung (mit Lektionstests): Beherrschen aus früheren Runden zählt nicht, erneutes Üben schon", async () => {
    const r = await rule("adminC", "repQuiz", { repeatEveryMonths: 12, confirmRepeatReset: true });
    expect(r.status).toBe(201);
    await getDb().insert(objectiveProgress).values({ userId: ids.quizL, objectiveId: course.repQuiz.objectiveId, status: "STRONG", masteryScore: "90", lastAttemptAt: t0 });
    await syncAssignmentStatus(ids.quizL, certIds.repQuiz, t0);
    expect((await assignment("quizL", "repQuiz"))!.status).toBe("completed");

    const later = monthsAfter(t0, 13);
    expect((await startDueRepeats(later, [orgC, orgD])).length).toBeGreaterThanOrEqual(1);
    await syncAssignmentStatus(ids.quizL, certIds.repQuiz, later);
    expect((await assignment("quizL", "repQuiz"))).toMatchObject({ status: "assigned", round: 2 }); // altes STRONG zählt nicht
    await getDb().update(objectiveProgress).set({ lastAttemptAt: new Date(later.getTime() + 5000) }).where(eq(objectiveProgress.userId, ids.quizL));
    await syncAssignmentStatus(ids.quizL, certIds.repQuiz, new Date(later.getTime() + 6000));
    expect((await assignment("quizL", "repQuiz"))).toMatchObject({ status: "completed", round: 2 });
  });

  it("Ohne Wiederholung bleibt Abgeschlossenes abgeschlossen (nur Regeln mit Wiederholung setzen zurück)", async () => {
    await getDb().update(companyAssignments).set({ status: "completed", completedAt: monthsAfter(t0, -40) }).where(and(eq(companyAssignments.userId, ids.opsC), eq(companyAssignments.certificationId, certIds.secDep)));
    await startDueRepeats(monthsAfter(t0, 60), [orgC, orgD]);
    expect((await assignment("opsC", "secDep"))).toMatchObject({ status: "completed", round: 1 });
  });
});
