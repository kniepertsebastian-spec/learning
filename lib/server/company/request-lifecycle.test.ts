/**
 * Anfrage zurückziehen (Firma) und Freigabe entziehen (Betreiber) gegen eine ECHTE Postgres-Datenbank
 * (nur mit TEST_DATABASE_URL). Entscheidung des Betreibers: beides ist erlaubt.
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
  courseRequestEvents,
  courseRequests,
  organizationMemberships,
  organizations,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { POST as customerCreate, GET as customerList } from "@/app/api/company/course-requests/route";
import { POST as withdrawRoute } from "@/app/api/company/course-requests/[id]/withdraw/route";
import { POST as assignRoute } from "@/app/api/company/assignments/route";
import { PATCH as adminStatus } from "@/app/api/admin/course-requests/[id]/route";
import { POST as adminRelease } from "@/app/api/admin/course-requests/[id]/release/route";
import { GET as entitlementsList, DELETE as entitlementsRevoke } from "@/app/api/admin/entitlements/route";
import { listAssignableLearningPaths } from "./assignments";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (id: string | null) => authMock.mockResolvedValue(id ? { user: { id } } : null);
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

run("Anfrage zurückziehen und Freigabe entziehen (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  const certIds: string[] = [];
  let orgA = "";
  let orgB = "";
  let cloud = "";
  let security = "";

  async function mkUser(key: string, role: "learner" | "admin" = "learner") {
    const [u] = await getDb().insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key, role }).returning({ id: users.id });
    ids[key] = u.id;
  }
  const member = (org: string, key: string, role: CompanyRole) => getDb().insert(organizationMemberships).values({ organizationId: org, userId: ids[key], role });
  async function mkCert(key: string) {
    const [c] = await getDb().insert(certifications).values({ slug: `lc-${key}-${tag}`, name: `LC ${key} ${tag}`, provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id });
    certIds.push(c.id);
    return c.id;
  }
  async function ask(as: string, certificationId: string) {
    signInAs(ids[as]);
    const res = await customerCreate(req("POST", { certificationId }));
    return res.status === 201 ? ((await res.json()).id as string) : res.status;
  }
  async function release(requestId: string) {
    signInAs(ids.operator);
    return adminRelease(req("POST", {}), ctx(requestId) as never);
  }
  const statusOf = async (id: string) => (await getDb().select().from(courseRequests).where(eq(courseRequests.id, id)))[0];

  beforeAll(async () => {
    orgA = (await getDb().insert(organizations).values({ name: `LifeA ${tag}` }).returning())[0].id;
    orgB = (await getDb().insert(organizations).values({ name: `LifeB ${tag}` }).returning())[0].id;
    await mkUser("operator", "admin");
    for (const k of ["adminA", "mentorA", "learnerA", "adminB"]) await mkUser(k);
    await member(orgA, "adminA", "company_admin");
    await member(orgA, "mentorA", "mentor");
    await member(orgA, "learnerA", "learner");
    await member(orgB, "adminB", "company_admin");
    cloud = await mkCert("cloud");
    security = await mkCert("security");
  });
  afterAll(async () => {
    await getDb().delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await getDb().delete(certifications).where(inArray(certifications.id, certIds));
    await getDb().delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  describe("Firma zieht eine Anfrage zurück", () => {
    it("offene Anfrage: Status „zurückgezogen“, Verlauf, Audit; danach neu anfragbar", async () => {
      const id = (await ask("mentorA", cloud)) as string;
      signInAs(ids.mentorA);
      expect((await withdrawRoute(req("POST"), ctx(id) as never)).status).toBe(200);
      expect(await statusOf(id)).toMatchObject({ status: "withdrawn", statusNote: "Von der Firma zurückgezogen" });
      const events = await getDb().select().from(courseRequestEvents).where(eq(courseRequestEvents.requestId, id));
      expect(events.map((e) => e.status)).toEqual(["submitted", "withdrawn"]);
      const audit = await getDb().select().from(auditEvents).where(and(eq(auditEvents.targetId, id), eq(auditEvents.action, "course_request.withdrawn")));
      expect(audit).toHaveLength(1);
      // zurückziehen macht den Katalogeintrag wieder anfragbar
      signInAs(ids.adminA);
      const { catalog } = (await (await customerList()).json()) as { catalog: { id: string }[] };
      expect(catalog.map((c) => c.id)).toContain(cloud);
      expect(typeof (await ask("adminA", cloud))).toBe("string");
    });

    it("nur eigene Firma, nur Firmen-Admin und Mentor, nur offene Anfragen", async () => {
      const id = (await ask("adminA", security)) as string;
      signInAs(ids.adminB);
      expect((await withdrawRoute(req("POST"), ctx(id) as never)).status).toBe(404); // fremde Firma
      signInAs(ids.learnerA);
      expect((await withdrawRoute(req("POST"), ctx(id) as never)).status).toBe(403);
      signInAs(null);
      expect((await withdrawRoute(req("POST"), ctx(id) as never)).status).toBe(401);
      signInAs(ids.operator);
      expect((await withdrawRoute(req("POST"), ctx(id) as never)).status).toBe(403); // Betreiber ist kein Firmenmitglied
      expect((await statusOf(id)).status).toBe("submitted");

      signInAs(ids.adminA);
      expect((await withdrawRoute(req("POST"), ctx("kein-uuid") as never)).status).toBe(404);
      expect((await withdrawRoute(req("POST"), ctx(randomUUID()) as never)).status).toBe(404);
      expect((await withdrawRoute(req("POST"), ctx(id) as never)).status).toBe(200);
      expect((await withdrawRoute(req("POST"), ctx(id) as never)).status).toBe(409); // schon zurückgezogen
    });

    it("freigegebene und abgelehnte Anfragen lassen sich nicht zurückziehen; der Betreiber ändert zurückgezogene nicht mehr", async () => {
      const id = (await ask("adminB", security)) as string;
      expect((await release(id)).status).toBe(200);
      signInAs(ids.adminB);
      expect((await withdrawRoute(req("POST"), ctx(id) as never)).status).toBe(409);
      expect((await statusOf(id)).status).toBe("released");

      const second = (await ask("adminA", cloud)) as string; // offene Anfrage aus dem vorigen Test ist noch da -> 409
      expect(second).toBe(409);

      // zurückgezogene Anfrage: Betreiber kann weder Stand setzen noch freigeben
      const [open] = await getDb().select().from(courseRequests).where(and(eq(courseRequests.organizationId, orgA), eq(courseRequests.certificationId, cloud), eq(courseRequests.status, "submitted")));
      signInAs(ids.adminA);
      expect((await withdrawRoute(req("POST"), ctx(open.id) as never)).status).toBe(200);
      signInAs(ids.operator);
      expect((await adminStatus(req("PATCH", { status: "in_creation" }), ctx(open.id) as never)).status).toBe(409);
      expect((await release(open.id)).status).toBe(409);
      expect(await getDb().select().from(companyCourseEntitlements).where(and(eq(companyCourseEntitlements.organizationId, orgA), eq(companyCourseEntitlements.certificationId, cloud)))).toHaveLength(0);
    });
  });

  describe("Betreiber entzieht eine Freigabe", () => {
    let requestId = "";
    beforeAll(async () => {
      authMock.mockReset();
      requestId = (await ask("adminA", cloud)) as string;
      expect((await release(requestId)).status).toBe(200);
    });

    const assign = async (as: string) => {
      signInAs(ids[as]);
      return assignRoute(req("POST", { userIds: [ids.learnerA], certificationId: cloud }));
    };

    it("Vorher: zuweisbar, in der Liste des Betreibers mit offenen Zuweisungen", async () => {
      expect((await assign("mentorA")).status).toBeLessThan(300);
      signInAs(ids.operator);
      const body = await (await entitlementsList()).json();
      const mine = body.entitlements.find((e: { organizationId: string; certificationId: string }) => e.organizationId === orgA && e.certificationId === cloud);
      expect(mine).toMatchObject({ organizationName: `LifeA ${tag}`, openAssignments: 1 });
    });

    it("nur der Betreiber darf entziehen; ungültige und unbekannte Freigaben: 400/404", async () => {
      for (const k of ["adminA", "mentorA", "learnerA", "adminB"]) {
        signInAs(ids[k]);
        expect((await entitlementsRevoke(req("DELETE", { organizationId: orgA, certificationId: cloud }))).status, k).toBe(403);
        expect((await entitlementsList()).status, k).toBe(403);
      }
      signInAs(null);
      expect((await entitlementsRevoke(req("DELETE", { organizationId: orgA, certificationId: cloud }))).status).toBe(401);
      signInAs(ids.operator);
      expect((await entitlementsRevoke(req("DELETE", { organizationId: "x", certificationId: cloud }))).status).toBe(400);
      expect((await entitlementsRevoke(req("DELETE", { organizationId: orgB, certificationId: cloud }))).status).toBe(404); // B hat sie nicht
      expect(await getDb().select().from(companyCourseEntitlements).where(and(eq(companyCourseEntitlements.organizationId, orgA), eq(companyCourseEntitlements.certificationId, cloud)))).toHaveLength(1);
    });

    it("Entziehen: keine neue Zuweisung mehr, bestehende bleiben, Anfrage „Freigabe entzogen“ mit Hinweis, Audit", async () => {
      signInAs(ids.operator);
      expect((await entitlementsRevoke(req("DELETE", { organizationId: orgA, certificationId: cloud, note: "Vertrag beendet" }))).status).toBe(200);
      expect((await entitlementsRevoke(req("DELETE", { organizationId: orgA, certificationId: cloud }))).status).toBe(404); // schon entzogen

      expect((await assign("mentorA")).status).toBeGreaterThanOrEqual(400); // nicht mehr zuweisbar
      const assignments = await getDb().select().from(companyAssignments).where(and(eq(companyAssignments.organizationId, orgA), eq(companyAssignments.certificationId, cloud)));
      expect(assignments).toHaveLength(1); // die bestehende bleibt
      const paths = await listAssignableLearningPaths(orgA);
      expect(paths.map((p) => p.id)).not.toContain(cloud);

      expect(await statusOf(requestId)).toMatchObject({ status: "revoked", statusNote: "Vertrag beendet" });
      const events = await getDb().select().from(courseRequestEvents).where(eq(courseRequestEvents.requestId, requestId));
      expect(events.map((e) => e.status)).toEqual(["submitted", "released", "revoked"]);
      const audit = await getDb().select().from(auditEvents).where(and(eq(auditEvents.targetId, orgA), eq(auditEvents.action, "course_entitlement.revoked")));
      expect(audit).toHaveLength(1);

      // Betreiber kann die entzogene Anfrage nicht erneut freigeben (neue Anfrage nötig)
      expect((await release(requestId)).status).toBe(409);
    });

    it("danach darf die Firma neu anfragen, und der Betreiber kann erneut freigeben", async () => {
      const again = await ask("adminA", cloud);
      expect(typeof again).toBe("string");
      expect((await release(again as string)).status).toBe(200);
      expect((await assign("adminA")).status).toBeLessThan(300);
      // die Freigabe einer anderen Firma bleibt von allem unberührt
      expect(await getDb().select().from(companyCourseEntitlements).where(eq(companyCourseEntitlements.organizationId, orgB))).toHaveLength(1);
    });
  });
});
