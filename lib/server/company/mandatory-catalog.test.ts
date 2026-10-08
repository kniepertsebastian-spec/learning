/**
 * Pflichtregel mit einem Kurs aus unserem Katalog, der für die Firma noch nicht freigeschaltet ist (echte DB):
 * die Regel wartet, niemand bekommt den Kurs vorher, die Freischaltung wird angefragt und mit unserer Freigabe weist die Regel zu.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));
vi.mock("@/lib/server/auth-rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/server/auth-rate-limit")>()), checkCourseRequestRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }) }));

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, companyAssignments, companyCourseEntitlements, courseRequests, mandatoryRules, organizationMemberships, organizations, users } from "@/lib/server/db/schema";
import { POST as createPost } from "@/app/api/company/mandatory/route";
import { releaseRequest } from "@/lib/server/admin/course-requests";
import { activatePendingRules, applyRulesForMember, listCatalogCoursesForRules, listMandatoryRules, runMandatoryMaintenance } from "./mandatory";

const run = TEST_DB ? describe : describe.skip;
const req = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

run("Pflichtregel mit Katalogkurs (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  const certs: Record<string, string> = {};
  let org = "";
  let operator = "";

  const create = async (certificationId: string, over: Record<string, unknown> = {}) => {
    authMock.mockResolvedValue({ user: { id: ids.admin } });
    const res = await createPost(req({ certificationId, roles: ["learner"], dueInDays: 14, ...over }));
    return { status: res.status, body: res.status === 201 ? await res.json() : null };
  };
  const assignmentsFor = (cert: string) => getDb().select().from(companyAssignments).where(and(eq(companyAssignments.organizationId, org), eq(companyAssignments.certificationId, certs[cert])));
  const requestsFor = (cert: string) => getDb().select().from(courseRequests).where(and(eq(courseRequests.organizationId, org), eq(courseRequests.certificationId, certs[cert])));

  beforeAll(async () => {
    const d = getDb();
    org = (await d.insert(organizations).values({ name: `Katalog ${tag}` }).returning())[0].id;
    for (const k of ["admin", "learner", "operator"]) {
      const [u] = await d.insert(users).values({ email: `${k}-${tag}@test.example`, passwordHash: "x", name: k, emailVerifiedAt: new Date(), ...(k === "operator" ? { role: "admin" as const } : {}) }).returning({ id: users.id });
      ids[k] = u.id;
    }
    operator = ids.operator;
    await d.insert(organizationMemberships).values([{ organizationId: org, userId: ids.admin, role: "company_admin" }, { organizationId: org, userId: ids.learner, role: "learner" }]);
    for (const [k, extra] of [["security", {}], ["second", {}], ["draft", { catalogStatus: "draft" as const }]] as const) {
      const [c] = await d.insert(certifications).values({ slug: `kat-${k}-${tag}`, name: `Security Updates ${k} ${tag}`, provider: "T", examName: "T", examVersion: "1", ...extra }).returning({ id: certifications.id });
      certs[k] = c.id;
    }
  });
  afterAll(async () => {
    await getDb().delete(organizations).where(eq(organizations.id, org));
    await getDb().delete(certifications).where(inArray(certifications.id, Object.values(certs)));
    await getDb().delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  it("Katalogliste: freigegebene, noch nicht freigeschaltete Kurse; Entwürfe nicht", async () => {
    const names = (await listCatalogCoursesForRules(org)).map((c) => c.id);
    expect(names).toContain(certs.security);
    expect(names).not.toContain(certs.draft);
    expect((await create(certs.draft)).status).toBe(404);
  });

  it("die Regel wartet: niemand bekommt den Kurs, die Freischaltung ist angefragt, die Liste zeigt „wartet“", async () => {
    const { status, body } = await create(certs.security);
    expect(status).toBe(201);
    expect(body.assigned).toBe(0);
    expect(await assignmentsFor("security")).toHaveLength(0);
    const requests = await requestsFor("security");
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("submitted");
    const rule = (await listMandatoryRules(org)).find((r) => r.certificationId === certs.security);
    expect(rule?.pendingRelease).toBe(true);
    // Auch ein neuer Beitritt und der tägliche Lauf weisen NICHT zu, solange nicht freigeschaltet.
    await runMandatoryMaintenance(new Date(), { organizationIds: [org] });
    await applyRulesForMember(org, ids.learner, "join");
    expect(await assignmentsFor("security")).toHaveLength(0);
    // Eine zweite Regel zum selben Kurs gibt es nicht.
    expect((await create(certs.security)).status).toBe(409);
  });

  it("mit unserer Freigabe wird die Regel aktiv und weist zu (einmal, auch bei doppeltem Aufruf)", async () => {
    const [request] = await requestsFor("security");
    await releaseRequest({ requestId: request.id, actorUserId: operator });
    const assigned = await assignmentsFor("security");
    expect(assigned.map((a) => a.userId)).toEqual([ids.learner]);
    expect(assigned[0].mandatoryRuleId).not.toBeNull();
    expect((await listMandatoryRules(org)).find((r) => r.certificationId === certs.security)?.pendingRelease).toBe(false);
    expect(await activatePendingRules(org, certs.security)).toBe(0);
    expect(await assignmentsFor("security")).toHaveLength(1);
  });

  it("schon offene Anfrage: keine zweite; Sicherheitsnetz im täglichen Lauf aktiviert nach direkter Freischaltung", async () => {
    // Offene Anfrage existiert schon (z. B. von Hand gestellt).
    await getDb().insert(courseRequests).values({ organizationId: org, requestedByUserId: ids.admin, certificationId: certs.second });
    expect((await create(certs.second)).status).toBe(201);
    expect(await requestsFor("second")).toHaveLength(1);
    expect(await assignmentsFor("second")).toHaveLength(0);
    // Freischaltung ohne releaseRequest (z. B. direkt in der Datenbank): der tägliche Lauf holt es nach.
    await getDb().insert(companyCourseEntitlements).values({ organizationId: org, certificationId: certs.second });
    await runMandatoryMaintenance(new Date(), { organizationIds: [org] });
    expect((await assignmentsFor("second")).map((a) => a.userId)).toEqual([ids.learner]);
  });

  it("Regel ist am Kurs der eigenen Firma gebunden: bereits freigeschaltete Kurse laufen wie bisher (nicht wartend)", async () => {
    const rule = await getDb().select().from(mandatoryRules).where(and(eq(mandatoryRules.organizationId, org), eq(mandatoryRules.certificationId, certs.second)));
    expect(rule[0].pendingRelease).toBe(false);
  });
});
