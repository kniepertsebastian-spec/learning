/**
 * Self-Service-Tests (Passwort ändern, Konto löschen, Datenexport) gegen eine ECHTE Postgres-
 * Datenbank. Wie die Firmen-Tests nur mit TEST_DATABASE_URL, sonst übersprungen.
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { and, eq, inArray, like, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  auditEvents,
  certifications,
  companyAssignments,
  companyInvitations,
  contentReports,
  domains,
  examAnswers,
  examAttempts,
  exams,
  objectiveProgress,
  objectives,
  organizationMemberships,
  organizations,
  questionOptions,
  questions,
  quizAnswers,
  quizAttempts,
  quizzes,
  remediationSessions,
  reviewItems,
  sections,
  sessionRecommendationFeedback,
  studyProfiles,
  studySessionItems,
  studySessions,
  syncEvents,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { DELETE as deleteAccountRoute } from "@/app/api/account/route";
import { GET as exportRoute } from "@/app/api/account/export/route";
import { POST as passwordRoute } from "@/app/api/account/password/route";
import { changePassword } from "./password";
import { deleteAccount } from "./delete";
import { exportAccountData } from "./export";
import { isSessionTokenValid } from "@/lib/server/session-validity";

const run = TEST_DB ? describe : describe.skip;
const PASSWORD = "altes-passwort-1";

function signInAs(userId: string | null) {
  authMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
}
const body = (data: unknown, method = "POST") => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data),
});

run("Self-Service: Passwort, Löschen, Export (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const emailOf = (key: string) => `${key}-${tag}@test.example`.toLowerCase();
  const ids: Record<string, string> = {};
  const orgs: string[] = [];
  let certId = "";
  let objectiveId = "";
  let questionId = "";
  let optionId = "";
  let quizId = "";
  let examId = "";
  let passwordHash = "";

  async function makeUser(key: string, role: "learner" | "admin" = "learner") {
    const [u] = await getDb()
      .insert(users)
      .values({ email: emailOf(key), passwordHash, name: key, role })
      .returning({ id: users.id });
    ids[key] = u.id;
    return u.id;
  }

  /** Legt für einen Nutzer Daten in allen user-gebundenen Lerntabellen an. */
  async function seedLearningData(userId: string) {
    const db = getDb();
    const [attempt] = await db.insert(quizAttempts).values({ quizId, userId, score: "80" }).returning();
    await db.insert(quizAnswers).values({
      quizAttemptId: attempt.id,
      questionId,
      selectedOptionId: optionId,
      isCorrect: true,
    });
    const [exam] = await db.insert(examAttempts).values({ examId, userId, score: "70" }).returning();
    await db.insert(examAnswers).values({ examAttemptId: exam.id, questionId, selectedOptionId: optionId, isCorrect: true });
    await db.insert(studyProfiles).values({ userId, certificationId: certId });
    const [session] = await db
      .insert(studySessions)
      .values({ userId, certificationId: certId, goalType: "minutes", goalValue: 15 })
      .returning();
    await db.insert(studySessionItems).values({
      sessionId: session.id,
      orderNum: 1,
      category: "new",
      referenceType: "question",
      referenceId: questionId,
    });
    await db.insert(sessionRecommendationFeedback).values({ sessionId: session.id, userId, helpful: true });
    await db.insert(objectiveProgress).values({ userId, objectiveId, masteryScore: "55" });
    await db.insert(remediationSessions).values({ userId, objectiveId, quizAttemptId: attempt.id, content: { lesson: "x" } });
    await db.insert(reviewItems).values({ userId, questionId, dueAt: new Date() });
    await db.insert(syncEvents).values({
      userId,
      clientEventId: randomUUID(),
      type: "section_quiz",
      status: "applied",
      clientCreatedAt: new Date(),
    });
    await db.insert(contentReports).values({
      reporterUserId: userId,
      targetType: "question",
      targetId: questionId,
      reason: "unclear",
    });
    await db.insert(auditEvents).values({ actorUserId: userId, action: "test.action" });
  }

  const USER_TABLES = [
    ["quiz_attempts", "user_id"],
    ["exam_attempts", "user_id"],
    ["study_profiles", "user_id"],
    ["study_sessions", "user_id"],
    ["session_recommendation_feedback", "user_id"],
    ["objective_progress", "user_id"],
    ["remediation_sessions", "user_id"],
    ["review_items", "user_id"],
    ["sync_events", "user_id"],
    ["content_reports", "reporter_user_id"],
    ["audit_events", "actor_user_id"],
    ["organization_memberships", "user_id"],
  ] as const;

  async function rowsFor(userId: string) {
    const out: Record<string, number> = {};
    for (const [table, column] of USER_TABLES) {
      const res = await getDb().execute(
        sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(column)} = ${userId}`,
      );
      out[table] = (res as unknown as { n: number }[])[0].n;
    }
    return out;
  }

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4); // schnell genug für Tests
    const db = getDb();
    const [cert] = await db
      .insert(certifications)
      .values({ slug: `acct-${tag}`, name: `Pfad ${tag}`, provider: "T", examName: "T", examVersion: "1" })
      .returning();
    certId = cert.id;
    const [domain] = await db.insert(domains).values({ certificationId: certId, orderNum: 1, name: { de: "D", en: "D" } as never }).returning();
    const [objective] = await db.insert(objectives).values({ domainId: domain.id, code: `O-${tag}`, title: { de: "O", en: "O" } as never }).returning();
    objectiveId = objective.id;
    const [section] = await db.insert(sections).values({ objectiveId, orderNum: 1, title: { de: "S", en: "S" } as never }).returning();
    const [quiz] = await db.insert(quizzes).values({ sectionId: section.id, certificationId: certId }).returning();
    quizId = quiz.id;
    const [question] = await db
      .insert(questions)
      .values({
        humanId: `Q-${tag}`,
        objectiveId,
        difficulty: "easy",
        type: "single",
        question: { de: "Frage", en: "Question" },
        explanation: { de: "E", en: "E" },
      })
      .returning();
    questionId = question.id;
    const [option] = await db
      .insert(questionOptions)
      .values({ questionId, orderNum: 1, text: { de: "A", en: "A" }, isCorrect: true })
      .returning();
    optionId = option.id;
    const [exam] = await db.insert(exams).values({ certificationId: certId, blueprint: {} as never }).returning();
    examId = exam.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (orgs.length) await db.delete(organizations).where(inArray(organizations.id, orgs));
    await db.delete(users).where(like(users.email, `%-${tag}@test.example`));
    await db.delete(certifications).where(eq(certifications.id, certId));
    await db.delete(auditEvents).where(like(auditEvents.targetId, `%`)).catch(() => {}); // Test-Audit bleibt harmlos
  });

  beforeEach(() => authMock.mockReset());

  describe("Passwort ändern", () => {
    it("falsches aktuelles Passwort: abgelehnt, nichts ändert sich", async () => {
      const id = await makeUser("pw-wrong");
      expect(await changePassword(id, "falsch", "neues-passwort-1")).toBe("wrong_password");
      const [row] = await getDb().select().from(users).where(eq(users.id, id));
      expect(row.passwordHash).toBe(passwordHash);
      expect(row.sessionVersion).toBe(0);
    });

    it("richtiges Passwort: neues gilt, altes nicht mehr, Sitzungsversion steigt", async () => {
      const id = await makeUser("pw-ok");
      expect(await changePassword(id, PASSWORD, "neues-passwort-1")).toBe("ok");
      const [row] = await getDb().select().from(users).where(eq(users.id, id));
      expect(await bcrypt.compare("neues-passwort-1", row.passwordHash)).toBe(true);
      expect(await bcrypt.compare(PASSWORD, row.passwordHash)).toBe(false);
      expect(row.sessionVersion).toBe(1);
      const audit = await getDb().select().from(auditEvents).where(and(eq(auditEvents.actorUserId, id), eq(auditEvents.action, "account.password_changed")));
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit[0])).not.toContain("neues-passwort");
    });

    it("API: Eingaben und Rechte (401, 400, 403, 200)", async () => {
      const id = await makeUser("pw-api");
      const call = async (data: unknown) =>
        passwordRoute(new Request("http://x/api/account/password", body(data)));

      signInAs(null);
      expect((await call({ currentPassword: PASSWORD, newPassword: "irgendwas-123" })).status).toBe(401);

      signInAs(id);
      expect((await call({ currentPassword: PASSWORD, newPassword: "kurz" })).status).toBe(400);
      expect((await call({ currentPassword: PASSWORD, newPassword: "ä".repeat(40) })).status).toBe(400); // > 72 Byte
      expect((await call({ currentPassword: PASSWORD, newPassword: PASSWORD })).status).toBe(400);
      expect((await call({ currentPassword: "falsch", newPassword: "irgendwas-123" })).status).toBe(403);
      expect((await call({ newPassword: "irgendwas-123" })).status).toBe(400);
      expect((await call({ currentPassword: PASSWORD, newPassword: "irgendwas-123" })).status).toBe(200);
    });

    it("API: nach 10 Versuchen sperrt das Limit (auch bei Fehlversuchen)", async () => {
      const id = await makeUser("pw-limit");
      signInAs(id);
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const res = await passwordRoute(
          new Request("http://x/api/account/password", body({ currentPassword: "falsch", newPassword: "irgendwas-123" })),
        );
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 403)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });

  describe("Sitzungen", () => {
    it("gelten nur, solange der Nutzer existiert und die Version passt", async () => {
      const id = await makeUser("sess");
      expect(await isSessionTokenValid(id, 0)).toBe(true);
      expect(await isSessionTokenValid(id, undefined)).toBe(true); // alte Tokens ohne Version = 0
      expect(await isSessionTokenValid(id, 1)).toBe(false);
      await changePassword(id, PASSWORD, "neues-passwort-1");
      expect(await isSessionTokenValid(id, 0)).toBe(false); // altes Token nach Passwortwechsel
      expect(await isSessionTokenValid(id, 1)).toBe(true);
      expect(await isSessionTokenValid(randomUUID(), 0)).toBe(false); // unbekannter Nutzer
    });
  });

  describe("Konto löschen", () => {
    it("alle Fremdschlüssel auf users sind CASCADE oder SET NULL (nichts blockiert die Löschung)", async () => {
      const res = (await getDb().execute(sql`
        select tc.table_name, kcu.column_name, rc.delete_rule
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
        join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
        join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
        where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'users' and ccu.column_name = 'id'
      `)) as unknown as { table_name: string; column_name: string; delete_rule: string }[];
      expect(res.length).toBeGreaterThanOrEqual(20);
      const bad = res.filter((r) => !["CASCADE", "SET NULL"].includes(r.delete_rule));
      expect(bad, JSON.stringify(bad)).toEqual([]);
    });

    it("falsches Passwort: nichts wird gelöscht", async () => {
      const id = await makeUser("del-wrong");
      expect(await deleteAccount(id, "falsch")).toEqual({ ok: false, reason: "wrong_password" });
      expect(await getDb().select().from(users).where(eq(users.id, id))).toHaveLength(1);
    });

    it("löscht Konto und ALLE persönlichen Lerndaten, lässt fremde Daten und Inhalte unberührt", async () => {
      const victim = await makeUser("del-full");
      const other = await makeUser("del-other");
      await seedLearningData(victim);
      await seedLearningData(other);
      const [org] = await getDb().insert(organizations).values({ name: `Firma ${tag}` }).returning();
      orgs.push(org.id);
      const adminId = await makeUser("del-org-admin");
      await getDb().insert(organizationMemberships).values({ organizationId: org.id, userId: adminId, role: "company_admin" });
      await getDb().insert(organizationMemberships).values({ organizationId: org.id, userId: victim, role: "learner" });
      await getDb().insert(companyAssignments).values({ organizationId: org.id, userId: victim, certificationId: certId });
      // Einladung an die Adresse des Nutzers und ein Audit-Eintrag über das Konto mit E-Mail in den Metadaten
      await getDb().insert(companyInvitations).values({
        organizationId: org.id,
        email: emailOf("del-full"),
        role: "learner",
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 1e9),
      });
      await getDb().insert(auditEvents).values({
        actorType: "cli",
        action: "role.changed",
        targetType: "user",
        targetId: victim,
        metadata: { email: emailOf("del-full") },
      });

      const before = await rowsFor(victim);
      expect(Object.values(before).every((n) => n >= 1), JSON.stringify(before)).toBe(true);
      const otherBefore = await rowsFor(other);

      expect(await deleteAccount(victim, PASSWORD)).toEqual({ ok: true });

      expect(await getDb().select().from(users).where(eq(users.id, victim))).toHaveLength(0);
      const after = await rowsFor(victim);
      expect(after, JSON.stringify(after)).toEqual(Object.fromEntries(Object.keys(after).map((k) => [k, 0])));
      expect(await getDb().select().from(companyAssignments).where(eq(companyAssignments.userId, victim))).toHaveLength(0);
      // Tochtertabellen (Antworten, Einträge) hängen an den gelöschten Eltern
      const answers = await getDb().select().from(quizAnswers).where(inArray(quizAnswers.quizAttemptId, (await getDb().select({ id: quizAttempts.id }).from(quizAttempts).where(eq(quizAttempts.userId, other))).map((r) => r.id)));
      expect(answers).toHaveLength(1); // die des anderen Nutzers bleiben
      // Einladung an die Adresse ist weg, Audit-Metadaten mit E-Mail ausgeräumt, Löschnachweis ohne PII
      expect(await getDb().select().from(companyInvitations).where(eq(companyInvitations.email, emailOf("del-full")))).toHaveLength(0);
      const trail = await getDb().select().from(auditEvents).where(eq(auditEvents.targetId, victim));
      expect(trail.find((e) => e.action === "role.changed")?.metadata).toBeNull();
      const deleted = trail.find((e) => e.action === "account.deleted");
      expect(deleted).toBeTruthy();
      expect(JSON.stringify(deleted)).not.toContain(emailOf("del-full"));
      expect(JSON.stringify(trail)).not.toContain(emailOf("del-full"));
      // Sitzungen des gelöschten Kontos sind ungültig
      expect(await isSessionTokenValid(victim, 0)).toBe(false);
      // Fremde Daten und Inhalte unberührt
      expect(await rowsFor(other)).toEqual(otherBefore);
      expect((await getDb().select().from(questions).where(eq(questions.id, questionId))).length).toBe(1);
    });

    it("verweigert Plattform-Admins und den letzten Firmen-Admin einer Organisation", async () => {
      const platformAdmin = await makeUser("del-platform", "admin");
      expect(await deleteAccount(platformAdmin, PASSWORD)).toEqual({ ok: false, reason: "platform_admin" });

      const [org] = await getDb().insert(organizations).values({ name: `Org ${tag}` }).returning();
      orgs.push(org.id);
      const sole = await makeUser("del-sole-admin");
      const second = await makeUser("del-second-admin");
      await getDb().insert(organizationMemberships).values({ organizationId: org.id, userId: sole, role: "company_admin" });
      expect(await deleteAccount(sole, PASSWORD)).toEqual({ ok: false, reason: "last_company_admin" });
      expect(await getDb().select().from(users).where(eq(users.id, sole))).toHaveLength(1);

      // mit einem zweiten Admin darf der erste gehen; ein Mentor oder Lernender sowieso
      await getDb().insert(organizationMemberships).values({ organizationId: org.id, userId: second, role: "company_admin" });
      expect(await deleteAccount(sole, PASSWORD)).toEqual({ ok: true });
      const mentor = await makeUser("del-mentor");
      await getDb().insert(organizationMemberships).values({ organizationId: org.id, userId: mentor, role: "mentor" as CompanyRole });
      expect(await deleteAccount(mentor, PASSWORD)).toEqual({ ok: true });
    });

    it("API: 401 ohne Anmeldung, 403 bei falschem Passwort, 409 bei letztem Admin, 200 sonst", async () => {
      const call = async (data: unknown) => deleteAccountRoute(new Request("http://x/api/account", body(data, "DELETE")));
      signInAs(null);
      expect((await call({ password: PASSWORD })).status).toBe(401);

      const id = await makeUser("del-api");
      signInAs(id);
      expect((await call({})).status).toBe(400);
      expect((await call({ password: "falsch" })).status).toBe(403);
      const platform = await makeUser("del-api-platform", "admin");
      signInAs(platform);
      const blocked = await call({ password: PASSWORD });
      expect(blocked.status).toBe(409);
      expect((await blocked.json()).error).toMatch(/Admin/);
      signInAs(id);
      expect((await call({ password: PASSWORD })).status).toBe(200);
    });
  });

  describe("Datenexport", () => {
    it("enthält alle persönlichen Daten des Nutzers, nie das Passwort und nie fremde Daten", async () => {
      const mine = await makeUser("exp-me");
      const theirs = await makeUser("exp-other");
      await seedLearningData(mine);
      await seedLearningData(theirs);
      const [org] = await getDb().insert(organizations).values({ name: `ExpOrg ${tag}` }).returning();
      orgs.push(org.id);
      await getDb().insert(organizationMemberships).values({ organizationId: org.id, userId: mine, role: "mentor" });
      await getDb().insert(companyAssignments).values({ organizationId: org.id, userId: mine, certificationId: certId, status: "in_progress" });

      const data = await exportAccountData(mine);
      expect(data).toBeTruthy();
      expect(data!.format).toBe("learning-export-v1");
      expect(data!.account).toMatchObject({ id: mine, email: emailOf("exp-me") });
      expect(data!.company.membership).toMatchObject({ organization: `ExpOrg ${tag}`, role: "mentor" });
      expect(data!.company.assignments).toHaveLength(1);
      expect(data!.learning.quizAttempts).toHaveLength(1);
      expect(data!.learning.quizAttempts[0].answers).toHaveLength(1);
      expect(data!.learning.examAttempts[0].answers).toHaveLength(1);
      expect(data!.learning.studySessions[0].items).toHaveLength(1);
      for (const key of ["objectiveProgress", "remediationSessions", "reviewItems", "studyProfiles", "sessionRecommendationFeedback"] as const) {
        expect(data!.learning[key], key).toHaveLength(1);
      }
      for (const key of ["syncEvents", "auditEventsAsActor", "contentReports"] as const) {
        expect(data!.activity[key], key).toHaveLength(1);
      }

      const text = JSON.stringify(data);
      expect(text).not.toContain(passwordHash);
      expect(text).not.toContain(theirs);
      expect(text).not.toContain(emailOf("exp-other"));
    });

    it("API: Download mit Dateiname und ohne Zwischenspeicher, 401 ohne Anmeldung, Limit 5 pro Stunde", async () => {
      signInAs(null);
      expect((await exportRoute()).status).toBe(401);

      const id = await makeUser("exp-api");
      signInAs(id);
      const res = await exportRoute();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="learning-export-\d{4}-\d{2}-\d{2}\.json"$/);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect((await res.json()).account.email).toBe(emailOf("exp-api"));

      for (let i = 0; i < 4; i++) expect((await exportRoute()).status).toBe(200);
      expect((await exportRoute()).status).toBe(429);
    });
  });
});
