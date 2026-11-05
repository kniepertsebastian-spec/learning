/** Skill-Abdeckung je Team gegen eine ECHTE Postgres-Datenbank: nur Freigegebenes, nur Gültiges, nur die eigene Firma, nur aggregiert. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { departments, organizationMemberships, organizations, userCertificates, users } from "@/lib/server/db/schema";
import { getTeamSkillCoverage } from "./certificates";

const run = TEST_DB ? describe : describe.skip;
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

run("Skill-Abdeckung je Team: Datenschutz (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let orgA = "";
  let orgB = "";

  beforeAll(async () => {
    const db = getDb();
    orgA = (await db.insert(organizations).values({ name: `CovA ${tag}` }).returning())[0].id;
    orgB = (await db.insert(organizations).values({ name: `CovB ${tag}` }).returning())[0].id;
    const [platform] = await db.insert(departments).values({ organizationId: orgA, name: "Plattform" }).returning();
    const [small] = await db.insert(departments).values({ organizationId: orgA, name: "Klein" }).returning();
    const [otherPlatform] = await db.insert(departments).values({ organizationId: orgB, name: "Plattform" }).returning();
    const person = async (key: string, org: string, departmentId: string | null) => {
      const [u] = await db.insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: `Name ${key}` }).returning({ id: users.id });
      userIds.push(u.id);
      await db.insert(organizationMemberships).values({ organizationId: org, userId: u.id, role: "learner", departmentId });
      return u.id;
    };
    const [anna, ben, carla, dora] = [await person("anna", orgA, platform.id), await person("ben", orgA, platform.id), await person("carla", orgA, platform.id), await person("dora", orgA, platform.id)];
    const klein1 = await person("klein1", orgA, small.id);
    await person("klein2", orgA, small.id);
    const fremd = await person("fremd", orgB, otherPlatform.id);
    const cert = (userId: string, title: string, shared: boolean, expiresAt: Date | null) =>
      db.insert(userCertificates).values({ userId, title, vendor: "CNCF", earnedAt: inDays(-100), expiresAt, sharedWithCompany: shared });
    await cert(anna, "CKA", true, null); // zählt
    await cert(ben, "CKA", false, null); // nicht freigegeben: zählt nicht
    await cert(carla, "CKA", true, inDays(-1)); // abgelaufen: zählt nicht
    await cert(carla, "CKAD", true, inDays(200)); // zählt
    await cert(klein1, "CKA", true, null); // Team zu klein: erscheint nicht
    await cert(fremd, "CKA", true, null); // andere Firma: zählt nicht
    void dora;
  });
  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(users).where(inArray(users.id, userIds));
  });

  it("zählt je Team nur freigegebene, noch gültige Zertifikate der eigenen Firma, im Verhältnis zur ganzen Teamgröße", async () => {
    const coverage = await getTeamSkillCoverage(orgA);
    expect(coverage.teams).toHaveLength(1);
    expect(coverage.teams[0]).toMatchObject({ department: "Plattform", members: 4 });
    expect(coverage.teams[0].skills).toEqual([
      { title: "CKA", vendor: "CNCF", holders: 1 },
      { title: "CKAD", vendor: "CNCF", holders: 1 },
    ]);
    expect(coverage.hiddenSmallTeams).toBe(1); // „Klein“ mit 2 Mitgliedern
  });

  it("enthält weder Namen noch Adressen noch Kennungen von Personen", async () => {
    const text = JSON.stringify(await getTeamSkillCoverage(orgA));
    for (const secret of ["Name anna", "anna-", "@test.example", ...userIds]) expect(text, secret).not.toContain(secret);
  });

  it("die andere Firma sieht nur ihre eigene Lage und hat kein Team über der Mindestgröße", async () => {
    const coverage = await getTeamSkillCoverage(orgB);
    expect(coverage.teams).toEqual([]);
    expect(coverage.hiddenSmallTeams).toBe(1);
  });
});
