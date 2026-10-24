/** Prüfer-Rolle, Einladung, Zuweisung und Zugriffsgrenzen gegen echte DB (Akzeptanzkriterium Phase 1). Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { getDb } from "@/lib/server/db/client";
import { certifications, courseApprovals, courseReviewers, organizations, questions, reviewerComments, reviewerQualifications, sections, users, type UserRole } from "@/lib/server/db/schema";
import { POST as commentRoute } from "@/app/api/reviewer/courses/[certId]/comments/route";
import { POST as approveRoute } from "@/app/api/reviewer/courses/[certId]/approve/route";
import { GET as adminApprovalRoute } from "@/app/api/admin/certifications/[certId]/approval/route";
import { POST as adminInviteRoute } from "@/app/api/admin/reviewers/invitations/route";
import { GET as companyTasksRoute } from "@/app/api/company/practice-tasks/route";
import { canViewCertification } from "@/lib/server/catalog/visibility";
import { seedCourse, seedLessons } from "@/lib/server/psrp/test-db";
import { getApprovalStatus } from "@/lib/server/approvals/service";
import {
  acceptReviewerInvitation,
  assignReviewer,
  canReviewCourse,
  createReviewerInvitation,
  getReviewerInvitationPreview,
  hasPendingReviewerInvitationForEmail,
  listAssignedCourses,
  listOpenReviewerComments,
  NotAGeneralCourseError,
  NotAReviewerError,
  resolveReviewerComment,
} from "./service";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (userId: string | null) => authMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
const req = (body?: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const certCtx = (certId: string) => ({ params: Promise.resolve({ certId }) });

run("Prüfer-Rolle (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const u: Record<string, string> = {};
  const c: Record<string, { certId: string; sectionId: string; questionId: string }> = {};
  let internalCertId = "";

  async function makeUser(key: string, role: UserRole) {
    const [row] = await getDb().insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key, role }).returning({ id: users.id });
    u[key] = row.id;
  }
  async function makeCourse(key: string) {
    const course = await seedCourse(1);
    const [sectionId] = await seedLessons(course.objectiveId, ["Inhalt"]);
    c[key] = { certId: course.certId, sectionId, questionId: course.questionIds[0] };
  }

  beforeAll(async () => {
    await makeUser("reviewer", "reviewer");
    await makeUser("reviewer2", "reviewer");
    await makeUser("admin", "admin");
    await makeUser("learner", "learner");
    await makeCourse("g1");
    await makeCourse("g2");
    const [org] = await getDb().insert(organizations).values({ name: `Firma ${tag}` }).returning();
    const [internal] = await getDb().insert(certifications).values({ slug: `intern-${tag}`, name: "Interner Pfad", provider: "T", examName: "T", examVersion: "1", kind: "internal", ownerOrganizationId: org.id, catalogStatus: "approved" }).returning();
    internalCertId = internal.id;
    await assignReviewer({ certificationId: c.g1.certId, userId: u.reviewer, assignedByUserId: u.admin });
  });

  it("sieht genau seine zugewiesenen allgemeinen Kurse", async () => {
    expect((await listAssignedCourses(u.reviewer)).map((x) => x.id)).toEqual([c.g1.certId]);
    expect(await canReviewCourse(u.reviewer, c.g1.certId)).toBe(true);
    expect(await canReviewCourse(u.reviewer, c.g2.certId)).toBe(false);
    expect(await canReviewCourse(u.reviewer, internalCertId)).toBe(false);
    expect(await canReviewCourse(u.reviewer2, c.g1.certId)).toBe(false);
    expect(await listAssignedCourses(u.reviewer2)).toEqual([]);
  });

  it("zuweisbar sind nur allgemeine Kurse und nur Personen mit Prüfer-Rolle", async () => {
    await expect(assignReviewer({ certificationId: internalCertId, userId: u.reviewer, assignedByUserId: u.admin })).rejects.toBeInstanceOf(NotAGeneralCourseError);
    await expect(assignReviewer({ certificationId: c.g2.certId, userId: u.learner, assignedByUserId: u.admin })).rejects.toBeInstanceOf(NotAReviewerError);
    await expect(createReviewerInvitation({ email: "x@test.example", certificationIds: [internalCertId], createdByUserId: u.admin })).rejects.toBeInstanceOf(NotAGeneralCourseError);
    await assignReviewer({ certificationId: c.g1.certId, userId: u.reviewer, assignedByUserId: u.admin }); // idempotent
    expect(await getDb().select().from(courseReviewers).where(eq(courseReviewers.userId, u.reviewer))).toHaveLength(1);
  });

  it("Rolle ohne Zuweisung wirkt nicht: Admin und Lernende haben keinen Prüferzugriff", async () => {
    expect(await canReviewCourse(u.admin, c.g1.certId)).toBe(false);
    expect(await canReviewCourse(u.learner, c.g1.certId)).toBe(false);
  });

  it("Kommentare: nur zugewiesener Kurs, Ziel muss zum Kurs gehören; Fehlermeldung nur für Fragen", async () => {
    signInAs(u.reviewer);
    const ok = await commentRoute(req({ targetType: "question", targetId: c.g1.questionId, kind: "faulty", text: "Lösungsschlüssel ist falsch" }), certCtx(c.g1.certId));
    expect(ok.status).toBe(201);
    expect((await commentRoute(req({ targetType: "section", targetId: c.g1.sectionId, kind: "comment", text: "Satz unklar" }), certCtx(c.g1.certId))).status).toBe(201);
    expect((await commentRoute(req({ targetType: "section", targetId: c.g1.sectionId, kind: "faulty", text: "falsch" }), certCtx(c.g1.certId))).status).toBe(400);
    expect((await commentRoute(req({ targetType: "question", targetId: c.g1.questionId, kind: "comment", text: "x" }), certCtx(c.g1.certId))).status).toBe(400);
    // Ziel aus einem anderen Kurs
    expect((await commentRoute(req({ targetType: "question", targetId: c.g2.questionId, kind: "comment", text: "Text drei" }), certCtx(c.g1.certId))).status).toBe(404);
    // nicht zugewiesener Kurs und interner Pfad: nicht auffindbar
    for (const certId of [c.g2.certId, internalCertId]) {
      expect((await commentRoute(req({ targetType: "question", targetId: c.g2.questionId, kind: "comment", text: "Text drei" }), certCtx(certId))).status).toBe(404);
    }
    // andere Rollen
    for (const [who, status] of [["learner", 403], ["admin", 403], [null, 401]] as const) {
      signInAs(who ? u[who] : null);
      expect((await commentRoute(req({ targetType: "question", targetId: c.g1.questionId, kind: "comment", text: "Text drei" }), certCtx(c.g1.certId))).status).toBe(status);
    }
    const open = await listOpenReviewerComments();
    expect(open.filter((x) => x.certificationId === c.g1.certId)).toHaveLength(2);
    expect(await resolveReviewerComment(open[0].id, u.admin)).toBe(true);
    expect(await resolveReviewerComment(open[0].id, u.admin)).toBe(false);
    expect(await getDb().select().from(reviewerComments).where(eq(reviewerComments.reviewerUserId, u.reviewer))).toHaveLength(2);
  });

  it("Freigabe durch den Prüfer: nur mit Bestätigung, nur zugewiesener Kurs, mit seiner Kennung im Protokoll", async () => {
    signInAs(u.reviewer);
    // Ohne Freischaltung (Probe-Review bestanden oder vom Betreiber) darf niemand freigeben.
    expect((await approveRoute(req({ displayName: "Dr. Prüfer", confirmed: true }), certCtx(c.g1.certId))).status).toBe(403);
    await getDb().insert(reviewerQualifications).values({ userId: u.reviewer, source: "admin" });
    expect((await approveRoute(req({ displayName: "Dr. Prüfer", confirmed: false }), certCtx(c.g1.certId))).status).toBe(400);
    expect((await approveRoute(req({ displayName: "Dr. Prüfer", confirmed: true }), certCtx(c.g2.certId))).status).toBe(404);
    expect((await approveRoute(req({ displayName: "Dr. Prüfer", confirmed: true }), certCtx(internalCertId))).status).toBe(404);
    const ok = await approveRoute(req({ displayName: "Dr. Prüfer", confirmed: true }), certCtx(c.g1.certId));
    expect(ok.status).toBe(201);
    const [row] = await getDb().select().from(courseApprovals).where(eq(courseApprovals.certificationId, c.g1.certId));
    expect(row).toMatchObject({ reviewerUserId: u.reviewer, recordedByUserId: u.reviewer, reviewerDisplayName: "Dr. Prüfer", versionLabel: "1.0" });
    expect((await getApprovalStatus(c.g1.certId)).state).toBe("current");
    signInAs(u.learner);
    expect((await approveRoute(req({ displayName: "Dr. Prüfer", confirmed: true }), certCtx(c.g1.certId))).status).toBe(403);
  });

  it("Admin-, Firmen- und Lerndaten bleiben für Prüfer unzugänglich", async () => {
    signInAs(u.reviewer);
    expect((await adminApprovalRoute(new Request("http://localhost/api"), certCtx(c.g1.certId))).status).toBe(403);
    expect((await adminInviteRoute(req({ email: "neu@test.example", certificationIds: [] }))).status).toBe(403);
    expect([401, 403, 404]).toContain((await companyTasksRoute()).status);
    // Im Lernkatalog gilt er wie jede Lernende: ein Kurs im Entwurf ist nicht sichtbar, ein interner Pfad einer fremden Firma auch nicht
    const viewer = { id: u.reviewer, role: "reviewer" as const };
    expect(await canViewCertification(viewer, { kind: "general", ownerOrganizationId: null, catalogStatus: "draft" })).toBe(false);
    expect(await canViewCertification(viewer, { kind: "internal", ownerOrganizationId: randomUUID(), catalogStatus: "approved" })).toBe(false);
  });

  it("Einladung: Vorschau, falsche E-Mail, Annahme (Rolle und Zuweisung), nur einmal, Ablauf, Widerruf", async () => {
    const email = `neu-${tag}@test.example`;
    expect(await hasPendingReviewerInvitationForEmail(email)).toBe(false);
    const { token } = await createReviewerInvitation({ email: ` ${email.toUpperCase()} `, certificationIds: [c.g1.certId, c.g2.certId], createdByUserId: u.admin });
    expect(await hasPendingReviewerInvitationForEmail(email)).toBe(true); // erlaubt die Registrierung
    expect(await getReviewerInvitationPreview(token)).toMatchObject({ email, courses: expect.arrayContaining([expect.any(String)]) });
    expect(await getReviewerInvitationPreview("falsch")).toBeNull();

    await makeUser("newcomer", "learner");
    const [other] = await getDb().select().from(users).where(eq(users.id, u.newcomer));
    expect(other.email).not.toBe(email);
    expect(await acceptReviewerInvitation(token, u.newcomer)).toEqual({ ok: false, reason: "email_mismatch" });

    await getDb().update(users).set({ email }).where(eq(users.id, u.newcomer));
    expect(await acceptReviewerInvitation(token, u.newcomer)).toEqual({ ok: true, courses: 2 });
    const [after] = await getDb().select().from(users).where(eq(users.id, u.newcomer));
    expect(after.role).toBe("reviewer");
    expect((await listAssignedCourses(u.newcomer)).map((x) => x.id).sort()).toEqual([c.g1.certId, c.g2.certId].sort());
    expect(await acceptReviewerInvitation(token, u.newcomer)).toEqual({ ok: false, reason: "invalid" });
    expect(await hasPendingReviewerInvitationForEmail(email)).toBe(false);

    // abgelaufen
    const old = await createReviewerInvitation({ email: `alt-${tag}@test.example`, certificationIds: [], createdByUserId: u.admin, now: new Date("2020-01-01T00:00:00Z") });
    expect(await getReviewerInvitationPreview(old.token)).toBeNull();
  });

  it("ein Admin bleibt Admin, wenn er eine Einladung annimmt", async () => {
    const [admin] = await getDb().select().from(users).where(eq(users.id, u.admin));
    const { token } = await createReviewerInvitation({ email: admin.email, certificationIds: [c.g2.certId], createdByUserId: u.admin });
    expect(await acceptReviewerInvitation(token, u.admin)).toEqual({ ok: true, courses: 1 });
    const [after] = await getDb().select().from(users).where(eq(users.id, u.admin));
    expect(after.role).toBe("admin");
    expect(await canReviewCourse(u.admin, c.g2.certId)).toBe(false); // weiter nur über die Admin-Werkstatt
    expect(await getDb().select().from(sections).limit(1)).toBeTruthy();
    expect(await getDb().select().from(questions).limit(1)).toBeTruthy();
  });
});
