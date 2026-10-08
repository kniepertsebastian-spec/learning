/**
 * Pflichtschulungen gegen eine ECHTE Postgres-Datenbank und einen lokalen SMTP-Server (nur mit TEST_DATABASE_URL):
 * Rechte, Mandantentrennung, Zuweisung an vorhandene und neue Mitglieder, Erinnerung, „überfällig“, Eskalation
 * (je Zuweisung höchstens einmal), kein Versand ohne Mailkonfiguration.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { eq, inArray } from "drizzle-orm";
import type { ParsedMail } from "mailparser";
import { getDb } from "@/lib/server/db/client";
import { assignmentNotices, certifications, companyAssignments, companyCourseEntitlements, mandatoryRules, organizationMemberships, organizations, users, type CompanyRole } from "@/lib/server/db/schema";
import { GET as listGet, POST as createPost } from "@/app/api/company/mandatory/route";
import { DELETE as deleteRoute } from "@/app/api/company/mandatory/[id]/route";
import { createInvitation, acceptInvitation } from "./invitations";
import { runMandatoryMaintenance } from "./mandatory";
import { startSmtpSink, useSmtpSinkEnv, type SmtpSink } from "@/lib/server/mail/test-smtp";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (id: string | null) => authMock.mockResolvedValue(id ? { user: { id } } : null);
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const DAY = 86_400_000;

run("Pflichtschulungen (echte DB + SMTP-Testserver)", () => {
  const tag = randomUUID().slice(0, 8);
  const mail = (key: string) => `${key}-${tag}@test.example`;
  const ids: Record<string, string> = {};
  const certIds: Record<string, string> = {};
  let orgA = "";
  let orgB = "";
  let sink: SmtpSink;
  let restoreEnv: () => void;
  let ruleId = "";
  const t0 = new Date();

  const addressesOf = (m: ParsedMail) => {
    const to = m.to as { value: { address: string }[] } | { value: { address: string }[] }[] | undefined;
    return (Array.isArray(to) ? to : to ? [to] : []).flatMap((a) => a.value.map((v) => v.address));
  };
  const mailsTo = (key: string, subjectPart?: string) => sink.messages.filter((m) => addressesOf(m).includes(mail(key)) && (!subjectPart || (m.subject ?? "").includes(subjectPart)));
  async function mkUser(key: string) {
    const [u] = await getDb().insert(users).values({ email: mail(key), passwordHash: "x", name: key, emailVerifiedAt: new Date() }).returning({ id: users.id });
    ids[key] = u.id;
  }
  const member = (org: string, key: string, role: CompanyRole) => getDb().insert(organizationMemberships).values({ organizationId: org, userId: ids[key], role });
  const assignmentOf = async (key: string, cert = "course") =>
    (await getDb().select().from(companyAssignments).where(eq(companyAssignments.userId, ids[key]))).find((a) => a.certificationId === certIds[cert]);
  async function create(as: string, over: Record<string, unknown> = {}) {
    signInAs(ids[as]);
    const res = await createPost(req("POST", { certificationId: certIds.course, roles: ["learner"], dueInDays: 14, reminderDaysBefore: 7, escalateAfterDays: 3, ...over }));
    return { status: res.status, body: res.status === 201 ? await res.json() : null };
  }

  beforeAll(async () => {
    sink = await startSmtpSink();
    restoreEnv = useSmtpSinkEnv(sink.port);
    const d = getDb();
    orgA = (await d.insert(organizations).values({ name: `PflichtA ${tag}` }).returning())[0].id;
    orgB = (await d.insert(organizations).values({ name: `PflichtB ${tag}` }).returning())[0].id;
    for (const k of ["adminA", "mentorA", "learnerA", "learnerA2", "doneA", "newbie", "adminB", "learnerB"]) await mkUser(k);
    await member(orgA, "adminA", "company_admin");
    await member(orgA, "mentorA", "mentor");
    await member(orgA, "learnerA", "learner");
    await member(orgA, "learnerA2", "learner");
    await member(orgA, "doneA", "learner");
    await member(orgB, "adminB", "company_admin");
    await member(orgB, "learnerB", "learner");
    for (const [key, extra] of [["course", {}], ["unreleased", {}], ["internB", { kind: "internal" as const, ownerOrganizationId: orgB }]] as const) {
      const [c] = await d.insert(certifications).values({ slug: `pf-${key}-${tag}`, name: `PF ${key} ${tag}`, provider: "T", examName: "T", examVersion: "1", ...extra }).returning({ id: certifications.id });
      certIds[key] = c.id;
    }
    await d.insert(companyCourseEntitlements).values({ organizationId: orgA, certificationId: certIds.course });
    // doneA hat den Lernpfad schon abgeschlossen (zugewiesen und erledigt): bleibt unverändert und bekommt nie Mails.
    await d.insert(companyAssignments).values({ organizationId: orgA, userId: ids.doneA, certificationId: certIds.course, status: "completed", completedAt: t0, dueAt: new Date(t0.getTime() + DAY) });
  });
  afterAll(async () => {
    restoreEnv();
    await sink.close();
    await getDb().delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await getDb().delete(certifications).where(inArray(certifications.id, Object.values(certIds)));
    await getDb().delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  it("Rechte: Anlegen und Löschen nur Firmen-Admin, Ansehen auch Mentor; Lernende, Fremde, Anonyme nicht", async () => {
    signInAs(null);
    expect((await listGet()).status).toBe(401);
    signInAs(ids.learnerA);
    expect((await listGet()).status).toBe(403);
    signInAs(ids.mentorA);
    expect((await listGet()).status).toBe(200);
    expect((await create("mentorA")).status).toBe(403);
    expect((await create("learnerA")).status).toBe(403);
    expect(await getDb().select().from(mandatoryRules).where(eq(mandatoryRules.organizationId, orgA))).toHaveLength(0);
  });

  it("Prüfung: nur zuweisbare Lernpfade, sinnvolle Werte, höchstens eine Regel je Lernpfad", async () => {
    expect((await create("adminA", { certificationId: certIds.unreleased })).status).toBe(404);
    expect((await create("adminA", { certificationId: certIds.internB })).status).toBe(404);
    for (const bad of [{ dueInDays: 0 }, { dueInDays: 366 }, { reminderDaysBefore: 61 }, { escalateAfterDays: 0 }, { roles: [] }, { roles: ["hacker"] }]) {
      expect((await create("adminA", bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(await getDb().select().from(mandatoryRules).where(eq(mandatoryRules.organizationId, orgA))).toHaveLength(0);
  });

  it("Anlegen: alle vorhandenen Mitglieder der Rolle bekommen den Lernpfad mit Frist, Abgeschlossenes bleibt, andere Rollen und Firmen nicht", async () => {
    const res = await create("adminA");
    expect(res.status).toBe(201);
    expect(res.body.assigned).toBe(2); // learnerA, learnerA2 (doneA hatte ihn schon)
    ruleId = res.body.id;
    for (const k of ["learnerA", "learnerA2"]) {
      const a = await assignmentOf(k);
      expect(a, k).toMatchObject({ status: "assigned", mandatoryRuleId: ruleId, organizationId: orgA });
      expect(Math.round((a!.dueAt!.getTime() - a!.assignedAt.getTime()) / DAY)).toBe(14);
    }
    expect((await assignmentOf("doneA"))!.status).toBe("completed");
    expect((await assignmentOf("doneA"))!.mandatoryRuleId).toBeNull();
    expect(await assignmentOf("mentorA")).toBeUndefined();
    expect(await assignmentOf("adminA")).toBeUndefined();
    expect(await assignmentOf("learnerB")).toBeUndefined();
    expect((await create("adminA")).status).toBe(409);
  });

  it("Liste: Regel mit Zählern; fremde Firma sieht nichts", async () => {
    signInAs(ids.mentorA);
    const data = await (await listGet()).json();
    expect(data.rules).toHaveLength(1);
    expect(data.rules[0]).toMatchObject({ id: ruleId, dueInDays: 14, roles: ["learner"], assigned: 2, completed: 0, overdue: 0 });
    // später gelesen: nach Ablauf der Frist zählen die offenen Zuweisungen als überfällig
    const { listMandatoryRules } = await import("./mandatory");
    expect((await listMandatoryRules(orgA, new Date(t0.getTime() + 30 * DAY)))[0]).toMatchObject({ assigned: 2, overdue: 2 });
    signInAs(ids.adminB);
    expect((await (await listGet()).json()).rules).toEqual([]);
  });

  it("Neues Mitglied per Einladung bekommt die Pflichtschulung sofort", async () => {
    await getDb().insert(users).values({ email: mail("newbie"), passwordHash: "x", name: "newbie" }).onConflictDoNothing();
    const { token } = await createInvitation({ organizationId: orgA, createdByUserId: ids.adminA, email: mail("newbie"), role: "learner" });
    const accepted = await acceptInvitation({ userId: ids.newbie, userEmail: mail("newbie"), token });
    expect(accepted.ok).toBe(true);
    expect(await assignmentOf("newbie")).toMatchObject({ mandatoryRuleId: ruleId });
    // Mentor-Einladung: Regel gilt nur für Lernende
    expect(await assignmentOf("mentorA")).toBeUndefined();
  });

  it("Lauf: Erinnerung vor der Frist (einmal), nur an offene Zuweisungen", async () => {
    const r1 = await runMandatoryMaintenance(new Date(t0.getTime() + 2 * DAY), { organizationIds: [orgA, orgB] }); // noch 12 Tage: zu früh
    expect(r1.reminders).toBe(0);
    const day8 = new Date(t0.getTime() + 8 * DAY); // noch 6 Tage ≤ 7
    const r2 = await runMandatoryMaintenance(day8, { organizationIds: [orgA, orgB] });
    expect(r2.reminders).toBeGreaterThanOrEqual(3); // learnerA, learnerA2, newbie (plus ggf. Reste anderer Läufe)
    for (const k of ["learnerA", "learnerA2", "newbie"]) expect(mailsTo(k, "Erinnerung"), k).toHaveLength(1);
    expect(mailsTo("doneA")).toHaveLength(0);
    expect(mailsTo("adminA")).toHaveLength(0);
    await runMandatoryMaintenance(day8, { organizationIds: [orgA, orgB] });
    expect(mailsTo("learnerA", "Erinnerung")).toHaveLength(1); // nicht doppelt
  });

  it("Lauf: nach der Frist „überfällig“ an die Person; Eskalation erst nach den eingestellten Tagen, als Sammelmail an Admin und Mentor", async () => {
    await runMandatoryMaintenance(new Date(t0.getTime() + 15 * DAY), { organizationIds: [orgA, orgB] }); // 1 Tag überfällig
    expect(mailsTo("learnerA", "Frist abgelaufen")).toHaveLength(1);
    expect(mailsTo("adminA", "überfällig")).toHaveLength(0);
    expect(mailsTo("mentorA", "überfällig")).toHaveLength(0);

    // learnerA2 schließt ab: bekommt keine Eskalation mehr
    await getDb().update(companyAssignments).set({ status: "completed", completedAt: new Date() }).where(eq(companyAssignments.userId, ids.learnerA2));
    const day18 = new Date(t0.getTime() + 18 * DAY);
    const result = await runMandatoryMaintenance(day18, { organizationIds: [orgA, orgB] });
    expect(result.escalations).toBeGreaterThanOrEqual(2);
    for (const k of ["adminA", "mentorA"]) {
      const digest = mailsTo(k, "überfällig");
      expect(digest, k).toHaveLength(1);
      const text = digest[0].text ?? "";
      expect(text).toContain(mail("learnerA"));
      expect(text).toContain(mail("newbie"));
      expect(text).not.toContain(mail("learnerA2"));
    }
    expect(mailsTo("learnerA", "überfällig")).toHaveLength(0); // Lernende bekommen keine Sammelmail
    await runMandatoryMaintenance(day18, { organizationIds: [orgA, orgB] });
    expect(mailsTo("adminA", "überfällig")).toHaveLength(1); // nicht erneut
    expect(await getDb().select().from(assignmentNotices).where(eq(assignmentNotices.kind, "escalation"))).not.toHaveLength(0);
  });

  it("Ohne Mailversand: nichts verschickt und nichts als „gesendet“ vermerkt; später wird nachgeholt", async () => {
    const [a] = await getDb().select().from(companyAssignments).where(eq(companyAssignments.userId, ids.learnerA));
    await getDb().delete(assignmentNotices).where(eq(assignmentNotices.assignmentId, a.id));
    restoreEnv();
    const off = await runMandatoryMaintenance(new Date(t0.getTime() + 20 * DAY), { organizationIds: [orgA, orgB] });
    expect(off).toMatchObject({ skippedNoMail: true, reminders: 0, overdue: 0, escalations: 0 });
    expect(await getDb().select().from(assignmentNotices).where(eq(assignmentNotices.assignmentId, a.id))).toHaveLength(0);
    restoreEnv = useSmtpSinkEnv(sink.port);
    const before = mailsTo("learnerA", "Frist abgelaufen").length;
    await runMandatoryMaintenance(new Date(t0.getTime() + 20 * DAY), { organizationIds: [orgA, orgB] });
    expect(mailsTo("learnerA", "Frist abgelaufen").length).toBe(before + 1);
  });

  it("Versand schlägt fehl (Mailserver nicht erreichbar): nichts als „gesendet“ vermerkt, der nächste Lauf versucht es erneut", async () => {
    const [a] = await getDb().select().from(companyAssignments).where(eq(companyAssignments.userId, ids.learnerA));
    await getDb().delete(assignmentNotices).where(eq(assignmentNotices.assignmentId, a.id));
    restoreEnv();
    restoreEnv = useSmtpSinkEnv(1); // Port 1: niemand lauscht
    const failed = await runMandatoryMaintenance(new Date(t0.getTime() + 21 * DAY), { organizationIds: [orgA, orgB] });
    expect(failed.overdue).toBe(0);
    expect(await getDb().select().from(assignmentNotices).where(eq(assignmentNotices.assignmentId, a.id))).toHaveLength(0);
    restoreEnv();
    restoreEnv = useSmtpSinkEnv(sink.port);
    const before = mailsTo("learnerA", "Frist abgelaufen").length;
    await runMandatoryMaintenance(new Date(t0.getTime() + 21 * DAY), { organizationIds: [orgA, orgB] });
    expect(mailsTo("learnerA", "Frist abgelaufen").length).toBe(before + 1);
  });

  it("Löschen: nur Firmen-Admin der eigenen Firma; Zuweisungen bleiben als normale Zuweisungen", async () => {
    signInAs(ids.mentorA);
    expect((await deleteRoute(req("DELETE"), ctx(ruleId))).status).toBe(403);
    signInAs(ids.adminB);
    expect((await deleteRoute(req("DELETE"), ctx(ruleId))).status).toBe(404);
    signInAs(ids.adminA);
    expect((await deleteRoute(req("DELETE"), ctx("kein-uuid"))).status).toBe(404);
    expect((await deleteRoute(req("DELETE"), ctx(ruleId))).status).toBe(200);
    expect((await deleteRoute(req("DELETE"), ctx(ruleId))).status).toBe(404);
    expect(await assignmentOf("learnerA")).toMatchObject({ mandatoryRuleId: null });
    expect(await getDb().select().from(mandatoryRules).where(eq(mandatoryRules.id, ruleId))).toHaveLength(0);
  });
});
