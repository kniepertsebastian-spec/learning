/**
 * Rechte-Tests für den Firmenbereich (Phase 1, Gate 1) gegen eine ECHTE
 * Postgres-Datenbank. Laufen nur mit TEST_DATABASE_URL (Datenbank mit
 * angewendeten Migrationen); ohne die Variable werden sie übersprungen, damit
 * `npm test` ohne Datenbank funktioniert. Die CI setzt sie (Postgres-Dienst).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
// next.config.ts schaltet experimental.authInterrupts ein; Next liest das zur Laufzeit
// aus dieser Variable (forbidden() wirft sonst außerhalb von Next).
process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "true";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyAssignments,
  organizationMemberships,
  organizations,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { GET } from "@/app/api/company/status/route";
import { COMPANY_STATUS_FIELDS } from "./status";
import { requireCompanyPage } from "./guard";

const run = TEST_DB ? describe : describe.skip;

type Fixture = {
  orgA: string;
  orgB: string;
  userIds: Record<string, string>;
  assignmentsA: string[];
  assignmentsB: string[];
};

function signInAs(userId: string | null) {
  authMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
}

async function call(path = "/api/company/status") {
  // GET() liest bewusst keine Anfrage-Parameter; wir übergeben trotzdem eine (mit fremder
  // organizationId), um zu belegen, dass sie ignoriert wird.
  const handler = GET as unknown as (request: Request) => Promise<Response>;
  const res = await handler(new Request(`http://localhost${path}`));
  return { status: res.status, body: await res.json() };
}

run("Firmenbereich: Zugriffsrechte (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const fx: Fixture = { orgA: "", orgB: "", userIds: {}, assignmentsA: [], assignmentsB: [] };
  let certId = "";

  async function makeUser(key: string, role: "learner" | "admin" = "learner") {
    const [u] = await getDb()
      .insert(users)
      .values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key, role })
      .returning({ id: users.id });
    fx.userIds[key] = u.id;
    return u.id;
  }

  async function addMember(orgId: string, userId: string, role: CompanyRole) {
    await getDb().insert(organizationMemberships).values({ organizationId: orgId, userId, role });
  }

  beforeAll(async () => {
    const db = getDb();
    const [cert] = await db
      .insert(certifications)
      .values({
        slug: `test-cert-${tag}`,
        name: `Testpfad ${tag}`,
        provider: "Test",
        examName: "T-1",
        examVersion: "1",
      })
      .returning({ id: certifications.id });
    certId = cert.id;

    const [a] = await db.insert(organizations).values({ name: `Firma A ${tag}` }).returning();
    const [b] = await db.insert(organizations).values({ name: `Firma B ${tag}` }).returning();
    fx.orgA = a.id;
    fx.orgB = b.id;

    await addMember(fx.orgA, await makeUser("adminA"), "company_admin");
    await addMember(fx.orgA, await makeUser("mentorA"), "mentor");
    await addMember(fx.orgA, await makeUser("learnerA"), "learner");
    await addMember(fx.orgB, await makeUser("adminB"), "company_admin");
    await addMember(fx.orgB, await makeUser("learnerB"), "learner");
    await makeUser("loner"); // ohne Organisation
    await makeUser("platformAdmin", "admin"); // Plattform-Admin ohne Organisation
    // Plattform-Admin, der in Firma A nur Lernender ist: Plattformrolle gibt keine Firmenrechte
    await addMember(fx.orgA, await makeUser("platformAdminLearnerA", "admin"), "learner");

    const mk = async (orgId: string, userId: string) => {
      const [row] = await db
        .insert(companyAssignments)
        .values({
          organizationId: orgId,
          userId,
          certificationId: certId,
          status: "in_progress",
          dueAt: new Date("2027-01-31T00:00:00Z"),
        })
        .returning({ id: companyAssignments.id });
      return row.id;
    };
    fx.assignmentsA.push(await mk(fx.orgA, fx.userIds.learnerA));
    fx.assignmentsB.push(await mk(fx.orgB, fx.userIds.learnerB));
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(inArray(organizations.id, [fx.orgA, fx.orgB]));
    await db.delete(users).where(inArray(users.id, Object.values(fx.userIds)));
    await db.delete(certifications).where(eq(certifications.id, certId));
  });

  beforeEach(() => authMock.mockReset());

  it("ohne Anmeldung: 401", async () => {
    signInAs(null);
    expect((await call()).status).toBe(401);
  });

  it("angemeldet ohne Organisation: 403 (auch als Plattform-Admin)", async () => {
    for (const key of ["loner", "platformAdmin"]) {
      signInAs(fx.userIds[key]);
      expect((await call()).status).toBe(403);
    }
  });

  it("Lernende der Firma sehen die Statusübersicht nicht: 403 (auch Plattform-Admin als Lernender)", async () => {
    for (const key of ["learnerA", "platformAdminLearnerA"]) {
      signInAs(fx.userIds[key]);
      expect((await call()).status).toBe(403);
    }
  });

  it("Firmen-Admin A sieht genau die Zuweisungen von Firma A und keine von Firma B", async () => {
    signInAs(fx.userIds.adminA);
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.organization.name).toBe(`Firma A ${tag}`);
    expect(body.entries.map((e: { assignmentId: string }) => e.assignmentId)).toEqual(fx.assignmentsA);
    expect(JSON.stringify(body)).not.toContain(fx.userIds.learnerB);
    expect(JSON.stringify(body)).not.toContain(fx.assignmentsB[0]);
  });

  it("Firmen-Admin B sieht umgekehrt nur Firma B", async () => {
    signInAs(fx.userIds.adminB);
    const { body } = await call();
    expect(body.entries.map((e: { assignmentId: string }) => e.assignmentId)).toEqual(fx.assignmentsB);
    expect(JSON.stringify(body)).not.toContain(fx.userIds.learnerA);
  });

  it("Mentor A sieht die Statusübersicht von Firma A", async () => {
    signInAs(fx.userIds.mentorA);
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.entries).toHaveLength(1);
  });

  it("die Organisation kommt aus der Mitgliedschaft, nicht aus der Anfrage", async () => {
    signInAs(fx.userIds.adminA);
    const { body } = await call(`/api/company/status?organizationId=${fx.orgB}&org=${fx.orgB}`);
    expect(body.organization.name).toBe(`Firma A ${tag}`);
    expect(body.entries.map((e: { assignmentId: string }) => e.assignmentId)).toEqual(fx.assignmentsA);
  });

  it("jeder Eintrag enthält genau die freigegebenen Felder und nichts sonst", async () => {
    signInAs(fx.userIds.adminA);
    const { body } = await call();
    for (const entry of body.entries) {
      expect(Object.keys(entry).sort()).toEqual([...COMPANY_STATUS_FIELDS].sort());
    }
    expect(body.entries[0].status).toBe("in_progress");
    expect(body.entries[0].dueAt).toBe("2027-01-31T00:00:00.000Z");
  });

  it("ein entzogenes Mitglied verliert den Zugriff sofort (kein Warten auf Session-Ablauf)", async () => {
    const userId = await makeUser("temp");
    await addMember(fx.orgA, userId, "mentor");
    signInAs(userId);
    expect((await call()).status).toBe(200);
    await getDb().delete(organizationMemberships).where(eq(organizationMemberships.userId, userId));
    expect((await call()).status).toBe(403);
  });

  it("Datenbank: ein Nutzer kann nur in einer Organisation Mitglied sein", async () => {
    await expect(addMember(fx.orgB, fx.userIds.learnerA, "learner")).rejects.toThrow();
  });

  it("Datenbank: eine Zuweisung kann nicht an ein Mitglied einer anderen Firma gehen", async () => {
    await expect(
      getDb().insert(companyAssignments).values({
        organizationId: fx.orgA,
        userId: fx.userIds.learnerB, // Mitglied von Firma B
        certificationId: certId,
      }),
    ).rejects.toThrow();
  });

  it("Seiten-Guard: ohne Anmeldung Weiterleitung, falsche Rolle 403, richtige Rolle Mitgliedschaft", async () => {
    signInAs(null);
    await expect(requireCompanyPage(["company_admin"])).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    signInAs(fx.userIds.learnerA);
    await expect(requireCompanyPage(["company_admin", "mentor"])).rejects.toMatchObject({
      digest: expect.stringContaining("403"),
    });
    signInAs(fx.userIds.mentorA);
    await expect(requireCompanyPage(["company_admin", "mentor"])).resolves.toMatchObject({
      organizationId: fx.orgA,
      role: "mentor",
    });
  });

  it("Fixture-Selbsttest: die Testdaten gehören zu zwei getrennten Organisationen", async () => {
    expect(fx.orgA).not.toBe(fx.orgB);
    expect(fx.assignmentsA).not.toEqual(fx.assignmentsB);
  });
});
