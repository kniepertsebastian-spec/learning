/**
 * Onboarding-Pläne gegen eine ECHTE Postgres-Datenbank (nur mit TEST_DATABASE_URL): Zugriff, Mandantentrennung,
 * Zuweisung aller Lernpfade, Stand „besprochen“/„geprüft“ (nur Mentor oder Firmen-Admin; geprüft erst nach Abschluss).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, companyAssignments, companyCourseEntitlements, onboardingPlans, onboardings, organizationMemberships, organizations, users, type CompanyRole } from "@/lib/server/db/schema";
import { GET as listGet, POST as createPost } from "@/app/api/company/onboardings/route";
import { DELETE as archiveRoute, POST as startPost } from "@/app/api/company/onboardings/[id]/route";
import { PATCH as statusPatch } from "@/app/api/company/onboarding-status/[id]/route";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (id: string | null) => authMock.mockResolvedValue(id ? { user: { id } } : null);
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

run("Onboarding-Pläne (echte DB)", () => {
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
    const [c] = await getDb().insert(certifications).values({ slug: `ob-${key}-${tag}`, name: `OB ${key} ${tag}`, provider: "T", examName: "T", examVersion: "1", ...extra }).returning({ id: certifications.id });
    certIds[key] = c.id;
  }
  async function create(as: string, over: Record<string, unknown> = {}) {
    signInAs(ids[as]);
    const res = await createPost(req("POST", { name: "Operations Infrastruktur", certificationIds: [certIds.lpic, certIds.ccna], mentorUserId: ids.mentorA, ...over }));
    return { status: res.status, id: res.status === 201 ? ((await res.json()).id as string) : "" };
  }
  async function start(as: string, planId: string, keys: string[]) {
    signInAs(ids[as]);
    return startPost(req("POST", { userIds: keys.map((k) => ids[k]) }), ctx(planId));
  }
  async function setStatus(as: string, onboardingId: string, status: string) {
    signInAs(ids[as]);
    return statusPatch(req("PATCH", { status }), ctx(onboardingId));
  }
  const onboardingOf = async (planId: string, key: string) =>
    (await getDb().select().from(onboardings).where(and(eq(onboardings.planId, planId), eq(onboardings.userId, ids[key]))))[0];

  beforeAll(async () => {
    orgA = (await getDb().insert(organizations).values({ name: `ObA ${tag}` }).returning())[0].id;
    orgB = (await getDb().insert(organizations).values({ name: `ObB ${tag}` }).returning())[0].id;
    for (const k of ["adminA", "mentorA", "mentorA2", "newbie", "newbie2", "learnerOnly", "adminB", "learnerB", "loner"]) await mkUser(k);
    await member(orgA, "adminA", "company_admin");
    await member(orgA, "mentorA", "mentor");
    await member(orgA, "mentorA2", "mentor");
    await member(orgA, "newbie", "learner");
    await member(orgA, "newbie2", "learner");
    await member(orgA, "learnerOnly", "learner");
    await member(orgB, "adminB", "company_admin");
    await member(orgB, "learnerB", "learner");
    await mkCert("lpic");
    await mkCert("ccna");
    await mkCert("unreleased");
    await mkCert("internB", { kind: "internal", ownerOrganizationId: orgB });
    for (const k of ["lpic", "ccna"]) await getDb().insert(companyCourseEntitlements).values({ organizationId: orgA, certificationId: certIds[k] });
  });
  afterAll(async () => {
    await getDb().delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await getDb().delete(certifications).where(inArray(certifications.id, Object.values(certIds)));
    await getDb().delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  it("Zugriff: nur Mentor und Firmen-Admin; Lernende, Fremde und Anonyme nicht", async () => {
    signInAs(null);
    expect((await listGet()).status).toBe(401);
    for (const k of ["learnerOnly", "loner"]) {
      signInAs(ids[k]);
      expect((await listGet()).status, k).toBe(403);
      expect((await create(k)).status, k).toBe(403);
    }
    for (const k of ["adminA", "mentorA"]) {
      signInAs(ids[k]);
      expect((await listGet()).status, k).toBe(200);
    }
  });

  let planId = "";
  it("Anlegen: Name, Lernpfade und Mentor; nur zuweisbare Lernpfade und ein Mentor/Admin der Firma", async () => {
    const ok = await create("adminA");
    expect(ok.status).toBe(201);
    planId = ok.id;
    const [plan] = await getDb().select().from(onboardingPlans).where(eq(onboardingPlans.id, planId));
    expect(plan).toMatchObject({ organizationId: orgA, name: "Operations Infrastruktur", mentorUserId: ids.mentorA });

    expect((await create("adminA", { certificationIds: [certIds.lpic, certIds.unreleased] })).status).toBe(404);
    expect((await create("adminA", { certificationIds: [certIds.internB] })).status).toBe(404);
    expect((await create("adminA", { mentorUserId: ids.newbie })).status).toBe(400); // Lernender kann nicht Mentor sein
    expect((await create("adminA", { mentorUserId: ids.adminB })).status).toBe(400); // fremde Firma
    expect((await create("adminA", { name: "ab" })).status).toBe(400);
    expect((await create("adminA", { certificationIds: [] })).status).toBe(400);
    // ohne Mentor-Angabe ist die anlegende Person Mentor
    const own = await create("mentorA2", { mentorUserId: null });
    expect((await getDb().select().from(onboardingPlans).where(eq(onboardingPlans.id, own.id)))[0].mentorUserId).toBe(ids.mentorA2);
  });

  it("Zuweisen: alle Lernpfade des Plans werden zugewiesen, Wiederholung ändert nichts, Fremde und Archivierte nicht", async () => {
    const res = await start("mentorA", planId, ["newbie"]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ started: [ids.newbie], alreadyStarted: [] });
    const assigned = await getDb().select().from(companyAssignments).where(eq(companyAssignments.userId, ids.newbie));
    expect(assigned.map((a) => a.certificationId).sort()).toEqual([certIds.lpic, certIds.ccna].sort());
    expect((await onboardingOf(planId, "newbie")).status).toBe("open");

    expect(await (await start("mentorA", planId, ["newbie"])).json()).toEqual({ started: [], alreadyStarted: [ids.newbie] });
    // Person einer anderen Firma: alles oder nichts
    expect((await start("mentorA", planId, ["newbie2", "learnerB"])).status).toBe(400);
    expect(await getDb().select().from(onboardings).where(eq(onboardings.userId, ids.newbie2))).toHaveLength(0);
    // Plan einer anderen Firma ist nicht auffindbar
    signInAs(ids.adminB);
    expect((await startPost(req("POST", { userIds: [ids.learnerB] }), ctx(planId))).status).toBe(404);
    expect((await archiveRoute(req("DELETE"), ctx(planId))).status).toBe(404);
  });

  it("Stand: „besprochen“ nur durch den Mentor des Plans oder Firmen-Admin", async () => {
    const o = await onboardingOf(planId, "newbie");
    expect((await setStatus("mentorA2", o.id, "discussed")).status).toBe(403); // anderer Mentor
    expect((await setStatus("newbie", o.id, "discussed")).status).toBe(403); // Lernende
    expect((await setStatus("adminB", o.id, "discussed")).status).toBe(404); // fremde Firma
    expect((await setStatus("mentorA", o.id, "bogus")).status).toBe(400);
    expect((await setStatus("mentorA", o.id, "discussed")).status).toBe(200);
    expect(await onboardingOf(planId, "newbie")).toMatchObject({ status: "discussed", statusByUserId: ids.mentorA });
  });

  it("Stand: „geprüft“ erst nach Abschluss aller Lernpfade, danach endgültig", async () => {
    const o = await onboardingOf(planId, "newbie");
    expect(((await (await setStatus("mentorA", o.id, "reviewed")).json()) as { error: string }).error).toMatch(/alle Lernpfade/);
    await getDb().update(companyAssignments).set({ status: "completed", completedAt: new Date() }).where(and(eq(companyAssignments.userId, ids.newbie), eq(companyAssignments.certificationId, certIds.lpic)));
    expect((await setStatus("mentorA", o.id, "reviewed")).status).toBe(409); // ccna fehlt noch
    await getDb().update(companyAssignments).set({ status: "completed", completedAt: new Date() }).where(eq(companyAssignments.userId, ids.newbie));
    expect((await setStatus("adminA", o.id, "reviewed")).status).toBe(200);
    expect(await onboardingOf(planId, "newbie")).toMatchObject({ status: "reviewed", statusByUserId: ids.adminA });
    expect((await setStatus("mentorA", o.id, "discussed")).status).toBe(409);
  });

  it("Liste: Mentor, Lernpfade und Fortschritt je Person; fremde Firma sieht nichts", async () => {
    signInAs(ids.adminA);
    const data = await (await listGet()).json();
    const plan = data.plans.find((p: { id: string }) => p.id === planId);
    expect(plan.mentor.userId).toBe(ids.mentorA);
    expect(plan.courses.map((c: { id: string }) => c.id)).toEqual([certIds.lpic, certIds.ccna]);
    expect(plan.people).toHaveLength(1);
    expect(plan.people[0]).toMatchObject({ userId: ids.newbie, status: "reviewed", coursesDone: 2, coursesTotal: 2 });
    expect(JSON.stringify(data)).not.toContain(`ObB ${tag}`);
    signInAs(ids.adminB);
    expect((await (await listGet()).json()).plans).toEqual([]);
  });

  it("Archivieren: Plan verschwindet aus der Liste, Zuweisung nicht mehr möglich, Onboarding bleibt bestehen", async () => {
    signInAs(ids.adminA);
    expect((await archiveRoute(req("DELETE"), ctx(planId))).status).toBe(200);
    expect((await archiveRoute(req("DELETE"), ctx(planId))).status).toBe(404);
    expect((await start("adminA", planId, ["newbie2"])).status).toBe(404);
    expect(await onboardingOf(planId, "newbie")).toBeDefined();
    expect((await (await listGet()).json()).plans.some((p: { id: string }) => p.id === planId)).toBe(false);
  });

  it("Mentor fällt weg: der Plan bleibt ohne Mentor bestehen; Firmen-Admin darf weiterhin Stand setzen", async () => {
    const p = await create("adminA", { name: "Ohne Mentor Plan", mentorUserId: ids.mentorA2 });
    await start("adminA", p.id, ["newbie2"]);
    await getDb().delete(users).where(eq(users.id, ids.mentorA2));
    delete ids.mentorA2;
    const [plan] = await getDb().select().from(onboardingPlans).where(eq(onboardingPlans.id, p.id));
    expect(plan.mentorUserId).toBeNull();
    const o = await onboardingOf(p.id, "newbie2");
    expect((await setStatus("mentorA", o.id, "discussed")).status).toBe(403);
    expect((await setStatus("adminA", o.id, "discussed")).status).toBe(200);
  });
});
