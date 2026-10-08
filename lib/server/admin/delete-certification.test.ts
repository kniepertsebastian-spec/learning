/** Kurs löschen (Betreiber), gegen eine echte DB: Schutz durch Slug und Bestätigung, Kaskade, nur allgemeine Kurse. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, companyAssignments, companyCourseEntitlements, domains, organizationMemberships, organizations, studyProfiles, users } from "@/lib/server/db/schema";
import { DELETE as deleteRoute, GET as impactRoute } from "@/app/api/admin/certifications/[certId]/route";

const run = TEST_DB ? describe : describe.skip;
const ctx = (certId: string) => ({ params: Promise.resolve({ certId }) }) as never;
const del = (body: unknown) => new Request("http://x", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

run("Kurs löschen (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  let org = "";
  const cert = async (key: string, extra: Record<string, unknown> = {}) => {
    const [c] = await getDb().insert(certifications).values({ slug: `del-${key}-${tag}`, name: `Del ${key}`, provider: "T", examName: "T", examVersion: "1", ...extra }).returning();
    await getDb().insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D", weightPercent: "100" });
    ids[key] = c.id;
    return c;
  };
  const exists = async (key: string) => (await getDb().select().from(certifications).where(eq(certifications.id, ids[key]))).length === 1;

  beforeAll(async () => {
    org = (await getDb().insert(organizations).values({ name: `Del ${tag}` }).returning())[0].id;
    for (const [k, role] of [["admin", "admin"], ["learner", "learner"]] as const) {
      const [u] = await getDb().insert(users).values({ email: `${k}-${tag}@test.example`, passwordHash: "x", name: k, role }).returning({ id: users.id });
      ids[k] = u.id;
    }
    await getDb().insert(organizationMemberships).values({ organizationId: org, userId: ids.learner, role: "learner" });
  });
  afterAll(async () => {
    await getDb().delete(organizations).where(eq(organizations.id, org));
    await getDb().delete(certifications).where(inArray(certifications.id, Object.values(ids).filter((v) => v !== ids.admin && v !== ids.learner)));
    await getDb().delete(users).where(inArray(users.id, [ids.admin, ids.learner]));
  });
  beforeEach(() => authMock.mockReset());

  it("nur der Betreiber darf", async () => {
    const c = await cert("a");
    authMock.mockResolvedValue({ user: { id: ids.learner } });
    expect((await deleteRoute(del({ confirmSlug: c.slug }), ctx(c.id))).status).toBe(403);
    expect((await impactRoute(new Request("http://x"), ctx(c.id))).status).toBe(403);
    authMock.mockResolvedValue(null);
    expect((await deleteRoute(del({ confirmSlug: c.slug }), ctx(c.id))).status).toBe(401);
    expect(await exists("a")).toBe(true);
  });

  it("ohne Daten: falscher Kurzname scheitert, richtiger löscht samt Inhalten (Dublette)", async () => {
    const c = await cert("dup");
    authMock.mockResolvedValue({ user: { id: ids.admin } });
    expect((await deleteRoute(del({ confirmSlug: "falsch" }), ctx(c.id))).status).toBe(400);
    expect(await exists("dup")).toBe(true);
    expect((await deleteRoute(del({ confirmSlug: c.slug }), ctx(c.id))).status).toBe(200);
    expect(await exists("dup")).toBe(false);
    expect(await getDb().select().from(domains).where(eq(domains.certificationId, c.id))).toHaveLength(0);
  });

  it("mit Lernstand und Firmenzuweisung: nur mit ausdrücklicher Bestätigung, dann geht alles mit", async () => {
    const c = await cert("used");
    await getDb().insert(studyProfiles).values({ userId: ids.learner, certificationId: c.id } as never);
    await getDb().insert(companyCourseEntitlements).values({ organizationId: org, certificationId: c.id });
    await getDb().insert(companyAssignments).values({ organizationId: org, userId: ids.learner, certificationId: c.id });
    authMock.mockResolvedValue({ user: { id: ids.admin } });
    const impact = await (await impactRoute(new Request("http://x"), ctx(c.id))).json();
    expect(impact.impact).toEqual({ learners: 1, companyAssignments: 1, companyEntitlements: 1, mandatoryRules: 0 });
    const refused = await deleteRoute(del({ confirmSlug: c.slug }), ctx(c.id));
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("data_attached");
    expect(await exists("used")).toBe(true);
    expect((await deleteRoute(del({ confirmSlug: c.slug, acknowledgeData: true }), ctx(c.id))).status).toBe(200);
    expect(await exists("used")).toBe(false);
    expect(await getDb().select().from(companyAssignments).where(eq(companyAssignments.certificationId, c.id))).toHaveLength(0);
  });

  it("interne Kurse einer Firma löscht der Betreiber nicht (404)", async () => {
    const c = await cert("intern", { kind: "internal", ownerOrganizationId: org });
    authMock.mockResolvedValue({ user: { id: ids.admin } });
    expect((await deleteRoute(del({ confirmSlug: c.slug, acknowledgeData: true }), ctx(c.id))).status).toBe(404);
    expect(await exists("intern")).toBe(true);
  });
});
