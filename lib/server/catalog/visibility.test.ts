/** Sichtbarkeit von Lernpfaden (freigegeben, allgemein, intern) gegen eine ECHTE Postgres-Datenbank. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, organizationMemberships, organizations, users } from "@/lib/server/db/schema";
import { canViewCertification, visibleCertificationsCondition, type Viewer } from "./visibility";

const run = TEST_DB ? describe : describe.skip;

run("Sichtbarkeit von Lernpfaden (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const certIds: Record<string, string> = {};
  const certs: Record<string, typeof certifications.$inferSelect> = {};
  const viewers: Record<string, Viewer> = {};
  const userIds: string[] = [];
  let orgA = "";
  let orgB = "";

  const visibleKeys = async (viewer: Viewer) => {
    const rows = await getDb().select().from(certifications).where(await visibleCertificationsCondition(viewer));
    return Object.keys(certIds).filter((k) => rows.some((r) => r.id === certIds[k])).sort();
  };

  beforeAll(async () => {
    const db = getDb();
    orgA = (await db.insert(organizations).values({ name: `VisA ${tag}` }).returning())[0].id;
    orgB = (await db.insert(organizations).values({ name: `VisB ${tag}` }).returning())[0].id;
    const mk = async (key: string, extra: Partial<typeof certifications.$inferInsert> = {}) => {
      const [c] = await db.insert(certifications).values({ slug: `vis-${key}-${tag}`, name: `Vis ${key}`, provider: "T", examName: "T", examVersion: "1", ...extra }).returning();
      certIds[key] = c.id;
      certs[key] = c;
    };
    await mk("allgemein");
    await mk("entwurf", { catalogStatus: "draft" });
    await mk("pruefung", { catalogStatus: "in_review" });
    await mk("internA", { kind: "internal", ownerOrganizationId: orgA });
    await mk("internEntwurf", { kind: "internal", ownerOrganizationId: orgA, catalogStatus: "draft" });
    const mkUser = async (key: string, role: "learner" | "admin", org?: string) => {
      const [u] = await db.insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", role }).returning({ id: users.id });
      userIds.push(u.id);
      if (org) await db.insert(organizationMemberships).values({ organizationId: org, userId: u.id, role: "learner" });
      viewers[key] = { id: u.id, role };
    };
    await mkUser("memberA", "learner", orgA);
    await mkUser("memberB", "learner", orgB);
    await mkUser("solo", "learner");
    await mkUser("operator", "admin");
    viewers.anon = null;
  });
  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(certifications).where(inArray(certifications.id, Object.values(certIds)));
    await db.delete(users).where(inArray(users.id, userIds));
  });

  it("Liste: ohne Konto und ohne Firma nur freigegebene allgemeine Lernpfade", async () => {
    for (const k of ["anon", "solo", "memberB"]) expect(await visibleKeys(viewers[k]), k).toEqual(["allgemein"]);
  });
  it("Liste: Mitglieder sehen zusätzlich die freigegebenen internen Lernpfade der eigenen Firma", async () => {
    expect(await visibleKeys(viewers.memberA)).toEqual(["allgemein", "internA"]);
  });
  it("Liste: Plattform-Admins sehen alles, auch Entwürfe", async () => {
    expect(await visibleKeys(viewers.operator)).toEqual(Object.keys(certIds).sort());
  });

  it("Einzelprüfung stimmt mit der Liste überein", async () => {
    for (const [vk, viewer] of Object.entries(viewers)) {
      const listed = await visibleKeys(viewer);
      for (const ck of Object.keys(certIds)) {
        expect(await canViewCertification(viewer, certs[ck]), `${vk} / ${ck}`).toBe(listed.includes(ck));
      }
    }
  });
});
