/** Firmen-Kursgruppen (UI U6) gegen echte DB, nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { auditEvents, certifications, companyAssignments, companyCourseEntitlements, companyCourseGroups, mandatoryRules, organizationMemberships, organizations, users, type CompanyRole } from "@/lib/server/db/schema";
import { GET as listRoute, POST as createRoute } from "@/app/api/company/course-groups/route";
import { DELETE as deleteRoute, PATCH as patchRoute } from "@/app/api/company/course-groups/[id]/route";
import { POST as assignRoute } from "@/app/api/company/course-groups/[id]/assign/route";
import { listCompanyStatus } from "./status";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (id: string | null) => authMock.mockResolvedValue(id ? { user: { id } } : null);
const json = (method: string, body?: unknown) => new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

run("Firmen-Kursgruppen (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  const certs: Record<string, string> = {};
  let orgA = "";
  let orgB = "";

  const addMember = (org: string, key: string, role: CompanyRole) => getDb().insert(organizationMemberships).values({ organizationId: org, userId: ids[key], role });

  beforeAll(async () => {
    const db = getDb();
    for (const key of ["admin", "mentor", "lern1", "lern2", "lern3", "bAdmin", "outsider"]) {
      const [u] = await db.insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key }).returning({ id: users.id });
      ids[key] = u.id;
    }
    orgA = (await db.insert(organizations).values({ name: `A ${tag}` }).returning())[0].id;
    orgB = (await db.insert(organizations).values({ name: `B ${tag}` }).returning())[0].id;
    await addMember(orgA, "admin", "company_admin");
    await addMember(orgA, "mentor", "mentor");
    await addMember(orgA, "lern1", "learner");
    await addMember(orgA, "lern2", "learner");
    await addMember(orgA, "lern3", "learner");
    await addMember(orgB, "bAdmin", "company_admin");
    const mk = async (key: string, extra: Partial<typeof certifications.$inferInsert> = {}) => {
      const [c] = await db.insert(certifications).values({ slug: `kg-${key}-${tag}`, name: `Kurs ${key} ${tag}`, provider: "T", examName: "T", examVersion: "1", ...extra }).returning({ id: certifications.id });
      certs[key] = c.id;
    };
    await mk("catalog");
    await mk("notEntitled");
    await mk("draft", { catalogStatus: "draft" });
    await mk("internal", { kind: "internal", ownerOrganizationId: orgA });
    await mk("foreignInternal", { kind: "internal", ownerOrganizationId: orgB });
    await db.insert(companyCourseEntitlements).values([{ organizationId: orgA, certificationId: certs.catalog }]);
    await db.insert(mandatoryRules).values({ organizationId: orgA, certificationId: certs.internal, roles: ["learner"], dueInDays: 30 });
  });
  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(certifications).where(inArray(certifications.id, Object.values(certs)));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });

  const body = (certKeys: string[], name = "Onboarding") => ({ name: { de: name, en: name }, color: "warning", certificationIds: certKeys.map((k) => certs[k]) });

  it("eine gemischte Gruppe (Katalog + intern) lässt sich anlegen, zuweisen und erscheint im Status", async () => {
    signInAs(ids.mentor);
    const created = await createRoute(json("POST", body(["catalog", "internal"])));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const res = await assignRoute(json("POST", { userIds: [ids.lern1, ids.lern2], dueAt: future(14) }), ctx(id));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ courses: 2, assigned: 4, alreadyAssigned: 0 });

    const rows = await getDb().select().from(companyAssignments).where(eq(companyAssignments.groupId, id));
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.dueAt?.toISOString())).size).toBe(1);
    // Die Statusansicht der Firma zeigt die entstandenen Zuweisungen (nur Status, keine Lerndaten).
    const status = await listCompanyStatus(orgA);
    expect(status.filter((s) => s.memberEmail.startsWith("lern1-") || s.memberEmail.startsWith("lern2-")).length).toBe(4);

    const listed = (await (await listRoute()).json()) as { groups: Array<{ id: string; items: Array<{ kind: string }>; people: unknown[] }> };
    const g = listed.groups.find((x) => x.id === id)!;
    expect(g.items.map((i) => i.kind).sort()).toEqual(["catalog", "mandatory"]);
    expect(g.people).toHaveLength(2);

    // erneut zuweisen ändert nichts
    const again = await assignRoute(json("POST", { userIds: [ids.lern1] }), ctx(id));
    expect(await again.json()).toMatchObject({ assigned: 0, alreadyAssigned: 2 });

    const audit = (await getDb().select({ a: auditEvents.action }).from(auditEvents).where(and(eq(auditEvents.actorUserId, ids.mentor)))).map((r) => r.a);
    expect(audit).toEqual(expect.arrayContaining(["company_course_group.create", "company_course_group.assign"]));
  });

  it("nur freigegebene bzw. eigene Kurse: fremde, nicht freigegebene und Entwürfe sind nicht auffindbar", async () => {
    signInAs(ids.admin);
    for (const key of ["notEntitled", "draft", "foreignInternal"]) {
      const res = await createRoute(json("POST", body(["catalog", key])));
      expect(res.status, key).toBe(404);
    }
    expect((await createRoute(json("POST", body([])))).status).toBe(400);
  });

  it("Lernende und Fremde haben keinen Zugriff; die Gruppen einer anderen Firma sind nicht auffindbar", async () => {
    signInAs(ids.admin);
    const { id } = (await (await createRoute(json("POST", body(["catalog"], "Nur A")))).json()) as { id: string };
    signInAs(ids.lern1);
    expect((await listRoute()).status).toBe(403);
    expect((await createRoute(json("POST", body(["catalog"])))).status).toBe(403);
    signInAs(ids.outsider);
    expect((await listRoute()).status).toBe(403);
    signInAs(ids.bAdmin);
    expect((await patchRoute(json("PATCH", body(["catalog"])), ctx(id))).status).toBe(404);
    expect((await deleteRoute(json("DELETE"), ctx(id))).status).toBe(404);
    expect((await assignRoute(json("POST", { userIds: [ids.bAdmin] }), ctx(id))).status).toBe(404);
    signInAs(null);
    expect((await listRoute()).status).toBe(401);
  });

  it("Personen anderer Firmen lassen sich nicht zuweisen; ungültige Frist wird abgelehnt", async () => {
    signInAs(ids.admin);
    const { id } = (await (await createRoute(json("POST", body(["catalog"], "Zuw")))).json()) as { id: string };
    expect((await assignRoute(json("POST", { userIds: [ids.bAdmin] }), ctx(id))).status).toBe(400);
    expect((await assignRoute(json("POST", { userIds: [ids.lern1], dueAt: "2020-01-01" }), ctx(id))).status).toBe(400);
  });

  it("Gruppe ändern und löschen: bestehende Zuweisungen bleiben", async () => {
    signInAs(ids.admin);
    const { id } = (await (await createRoute(json("POST", body(["catalog"], "Alt")))).json()) as { id: string };
    await assignRoute(json("POST", { userIds: [ids.lern3] }), ctx(id));
    expect((await patchRoute(json("PATCH", body(["internal"], "Neu")), ctx(id))).status).toBe(204);
    const before = await getDb().select().from(companyAssignments).where(eq(companyAssignments.groupId, id));
    expect(before).toHaveLength(1);
    expect((await deleteRoute(json("DELETE"), ctx(id))).status).toBe(204);
    const after = await getDb().select().from(companyAssignments).where(and(eq(companyAssignments.userId, ids.lern3), eq(companyAssignments.certificationId, certs.catalog)));
    expect(after).toHaveLength(1);
    expect(after[0].groupId).toBeNull();
    const gone = await getDb().select().from(companyCourseGroups).where(eq(companyCourseGroups.id, id));
    expect(gone).toHaveLength(0);
  });
});
