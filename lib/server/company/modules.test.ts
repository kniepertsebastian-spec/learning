/**
 * Firmenmodule (Verantwortlicher, „gültig bis“) gegen eine ECHTE Postgres-Datenbank (nur mit TEST_DATABASE_URL):
 * Zugriff, Mandantentrennung, Sichtbarkeit je Rolle, Ablauf (Inhalt für Lernende verborgen), Verlängern, Wegfall des
 * Verantwortlichen. Dazu reine Tests der Ablauf-Regel.
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
  companyModules,
  organizationMemberships,
  organizations,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { GET as listGet, POST as createPost } from "@/app/api/company/modules/route";
import { PATCH as patchRoute, DELETE as deleteRoute } from "@/app/api/company/modules/[id]/route";
import { listModulesForOrg, listModulesForPath, moduleState, todayIso } from "./modules";

describe("moduleState", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  it("der Tag „gültig bis“ zählt noch (einschließlich), danach abgelaufen", () => {
    expect(moduleState("2026-10-07", now)).toBe("expiring");
    expect(moduleState("2026-10-06", now)).toBe("expired");
  });
  it("läuft bald ab: bis einschließlich 30 Tage, davor gültig", () => {
    expect(moduleState("2026-11-06", now)).toBe("expiring");
    expect(moduleState("2026-11-07", now)).toBe("valid");
  });
  it("todayIso nimmt das UTC-Datum", () => {
    expect(todayIso(new Date("2026-10-07T23:59:59Z"))).toBe("2026-10-07");
  });
});

const run = TEST_DB ? describe : describe.skip;
const signInAs = (id: string | null) => authMock.mockResolvedValue(id ? { user: { id } } : null);
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const inDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

run("Firmenmodule (echte DB)", () => {
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
    const [c] = await getDb().insert(certifications).values({ slug: `mod-${key}-${tag}`, name: `MOD ${key} ${tag}`, provider: "T", examName: "T", examVersion: "1", ...extra }).returning({ id: certifications.id });
    certIds[key] = c.id;
  }
  async function create(as: string, cert: string, extra: Record<string, unknown> = {}) {
    signInAs(ids[as]);
    const res = await createPost(req("POST", { certificationId: certIds[cert], title: "Unser Ticket-Prozess", body: "## Schritte\n1. Ticket anlegen\n2. Priorität setzen", validUntil: inDays(90), ...extra }));
    return { status: res.status, id: res.status === 201 ? ((await res.json()).id as string) : "" };
  }
  async function insertModule(over: Partial<typeof companyModules.$inferInsert>) {
    const [m] = await getDb().insert(companyModules).values({ organizationId: orgA, certificationId: certIds.security, title: "Direkt angelegt", body: "Inhalt", validUntil: inDays(90), responsibleUserId: ids.mentorA, ...over }).returning({ id: companyModules.id });
    return m.id;
  }
  async function patch(as: string, id: string, body: unknown) {
    signInAs(ids[as]);
    return patchRoute(req("PATCH", body), ctx(id) as never);
  }

  beforeAll(async () => {
    orgA = (await getDb().insert(organizations).values({ name: `ModA ${tag}` }).returning())[0].id;
    orgB = (await getDb().insert(organizations).values({ name: `ModB ${tag}` }).returning())[0].id;
    for (const k of ["adminA", "mentorA", "mentorA2", "learnerA", "learnerNoPath", "adminB", "loner", "operator"]) await mkUser(k);
    await member(orgA, "adminA", "company_admin");
    await member(orgA, "mentorA", "mentor");
    await member(orgA, "mentorA2", "mentor");
    await member(orgA, "learnerA", "learner");
    await member(orgA, "learnerNoPath", "learner");
    await member(orgB, "adminB", "company_admin");
    await mkCert("security");
    await mkCert("unreleased");
    await mkCert("draft", { catalogStatus: "draft" });
    await mkCert("internA", { kind: "internal", ownerOrganizationId: orgA });
    await mkCert("internB", { kind: "internal", ownerOrganizationId: orgB });
    await getDb().insert(companyCourseEntitlements).values({ organizationId: orgA, certificationId: certIds.security });
    await getDb().insert(companyAssignments).values({ organizationId: orgA, userId: ids.learnerA, certificationId: certIds.security });
  });
  afterAll(async () => {
    await getDb().delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await getDb().delete(certifications).where(inArray(certifications.id, Object.values(certIds)));
    await getDb().delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  it("Zugriff: Verwaltung nur Mentor und Firmen-Admin; Lernende, Fremde, Betreiber und Anonyme nicht", async () => {
    signInAs(null);
    expect((await listGet()).status).toBe(401);
    for (const k of ["learnerA", "loner", "operator"]) {
      signInAs(ids[k]);
      expect((await listGet()).status, k).toBe(403);
      expect((await createPost(req("POST", { certificationId: certIds.security, title: "Modul", body: "x", validUntil: inDays(5) }))).status, k).toBe(403);
    }
    for (const k of ["adminA", "mentorA"]) {
      signInAs(ids[k]);
      expect((await listGet()).status, k).toBe(200);
    }
  });

  let moduleId = "";
  it("Anlegen: ohne Angabe ist die anlegende Person verantwortlich; nur zuweisbare Lernpfade", async () => {
    const ok = await create("mentorA", "security");
    expect(ok.status).toBe(201);
    moduleId = ok.id;
    const [row] = await getDb().select().from(companyModules).where(eq(companyModules.id, moduleId));
    expect(row).toMatchObject({ organizationId: orgA, responsibleUserId: ids.mentorA, createdByUserId: ids.mentorA, archivedAt: null });
    expect((await create("adminA", "internA", { title: "Internes Modul" })).status).toBe(201);
    for (const cert of ["unreleased", "draft", "internB"]) expect((await create("adminA", cert)).status, cert).toBe(404);
    const audit = await getDb().select().from(auditEvents).where(and(eq(auditEvents.targetId, moduleId), eq(auditEvents.action, "company_module.created")));
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("Ticket");
  });

  it("Verantwortlicher nur Mentor oder Firmen-Admin DER Firma", async () => {
    expect((await create("adminA", "security", { responsibleUserId: ids.mentorA2 })).status).toBe(201);
    for (const k of ["learnerA", "adminB", "loner"]) expect((await create("adminA", "security", { responsibleUserId: ids[k] })).status, k).toBe(400);
    expect((await create("adminA", "security", { responsibleUserId: randomUUID() })).status).toBe(400);
    expect((await create("adminA", "security", { responsibleUserId: "kein-uuid" })).status).toBe(400);
  });

  it("ungültige Eingaben: Titel, Inhalt, Datum (Vergangenheit, > 5 Jahre, kein Kalendertag, Format)", async () => {
    expect((await create("adminA", "security", { title: "ab" })).status).toBe(400);
    expect((await create("adminA", "security", { title: "x".repeat(201) })).status).toBe(400);
    expect((await create("adminA", "security", { body: "   " })).status).toBe(400);
    expect((await create("adminA", "security", { body: "x".repeat(20_001) })).status).toBe(400);
    for (const validUntil of [inDays(-1), inDays(5 * 366 + 5), "2026-02-30", "morgen", "07.10.2026", ""]) {
      expect((await create("adminA", "security", { validUntil })).status, String(validUntil)).toBe(400);
    }
    expect((await create("adminA", "security", { validUntil: todayIso() })).status).toBe(201); // heute ist erlaubt
    expect((await create("adminA", "security", { certificationId: "kein-uuid" })).status).toBe(400);
  });

  it("Verwaltungsliste: nur die eigene Firma, früheste Ablaufdaten zuerst, Zustand und Verantwortlicher", async () => {
    const expiredId = await insertModule({ title: "Alt", validUntil: inDays(-3), responsibleUserId: ids.mentorA });
    const soonId = await insertModule({ title: "Bald", validUntil: inDays(10), responsibleUserId: ids.adminA });
    const list = await listModulesForOrg(orgA);
    const byId = Object.fromEntries(list.map((m) => [m.id, m]));
    expect(byId[expiredId]).toMatchObject({ state: "expired", responsibleName: "mentorA" });
    expect(byId[soonId]).toMatchObject({ state: "expiring", responsibleEmail: `adminA-${tag}@test.example` });
    expect(byId[moduleId].state).toBe("valid");
    expect(list.findIndex((m) => m.id === expiredId)).toBeLessThan(list.findIndex((m) => m.id === soonId));
    expect(list.findIndex((m) => m.id === soonId)).toBeLessThan(list.findIndex((m) => m.id === moduleId));
    signInAs(ids.adminB);
    const b = await (await listGet()).json();
    expect(b.modules).toHaveLength(0);
    expect(b.responsible.map((r: { userId: string }) => r.userId)).toEqual([ids.adminB]);
  });

  it("Lernpfad-Seite: Mentor/Admin sehen alles, Lernende nur mit zugewiesenem Lernpfad, abgelaufen ohne Inhalt", async () => {
    const path = (role: CompanyRole, userKey: string, org = orgA, cert = "security") =>
      listModulesForPath({ organizationId: org, userId: ids[userKey], role, certificationId: certIds[cert] });
    const mgr = await path("mentor", "mentorA");
    expect(mgr.map((m) => m.title).sort()).toEqual(expect.arrayContaining(["Alt", "Bald", "Unser Ticket-Prozess"]));
    expect(mgr.find((m) => m.title === "Alt")!.body).toBe("Inhalt"); // Verwalter sehen auch Abgelaufenes

    const learner = await path("learner", "learnerA");
    expect(learner.find((m) => m.title === "Unser Ticket-Prozess")!.body).toContain("Ticket anlegen");
    expect(learner.find((m) => m.title === "Alt")).toMatchObject({ state: "expired", body: null });
    expect(learner.find((m) => m.title === "Bald")).toMatchObject({ state: "expiring" });

    expect(await path("learner", "learnerNoPath")).toEqual([]);
    expect(await path("company_admin", "adminB", orgB)).toEqual([]); // andere Firma sieht nichts
    expect(await path("learner", "learnerA", orgA, "internA")).toEqual([]); // nicht zugewiesen
    // archivierte Module erscheinen nirgends
    const gone = await insertModule({ title: "Archiviert", archivedAt: new Date() });
    expect((await listModulesForOrg(orgA)).map((m) => m.id)).not.toContain(gone);
  });

  it("Verlängern: nur „gültig bis“ ändert sich, Inhalt für Lernende ist wieder sichtbar, Audit „extended“", async () => {
    const [alt] = await getDb().select().from(companyModules).where(and(eq(companyModules.organizationId, orgA), eq(companyModules.title, "Alt")));
    expect((await patch("mentorA2", alt.id, { validUntil: inDays(365) })).status).toBe(200);
    const [after] = await getDb().select().from(companyModules).where(eq(companyModules.id, alt.id));
    expect(after).toMatchObject({ title: "Alt", body: "Inhalt", validUntil: inDays(365) });
    const learner = await listModulesForPath({ organizationId: orgA, userId: ids.learnerA, role: "learner", certificationId: certIds.security });
    expect(learner.find((m) => m.id === alt.id)).toMatchObject({ state: "valid", body: "Inhalt" });
    const audit = await getDb().select().from(auditEvents).where(eq(auditEvents.targetId, alt.id));
    expect(audit.map((a) => a.action)).toEqual(["company_module.extended"]);
    expect((await patch("mentorA2", alt.id, { validUntil: inDays(-1) })).status).toBe(400); // nicht in die Vergangenheit
  });

  it("Ändern: Titel, Inhalt, Verantwortlicher; Lernende, fremde Firma und Unbekanntes scheitern", async () => {
    expect((await patch("adminA", moduleId, { title: "Neuer Titel", body: "Neuer Inhalt", responsibleUserId: ids.mentorA2 })).status).toBe(200);
    expect(await getDb().select().from(companyModules).where(eq(companyModules.id, moduleId))).toEqual([expect.objectContaining({ title: "Neuer Titel", body: "Neuer Inhalt", responsibleUserId: ids.mentorA2 })]);
    expect((await patch("adminA", moduleId, { responsibleUserId: ids.learnerA })).status).toBe(400);
    expect((await patch("adminA", moduleId, {})).status).toBe(400);
    expect((await patch("adminA", moduleId, { title: "x" })).status).toBe(400);
    expect((await patch("learnerA", moduleId, { title: "Gehackt!" })).status).toBe(403);
    expect((await patch("adminB", moduleId, { title: "Fremd!" })).status).toBe(404);
    expect((await patch("adminA", randomUUID(), { title: "Gibt es nicht" })).status).toBe(404);
    expect((await patch("adminA", "kein-uuid", { title: "Gibt es nicht" })).status).toBe(404);
    expect((await getDb().select().from(companyModules).where(eq(companyModules.id, moduleId)))[0].title).toBe("Neuer Titel");
  });

  it("Verantwortlicher fällt weg: Modul bleibt, erscheint „ohne Verantwortlichen“ (Konto gelöscht, Mitgliedschaft entfernt, zum Lernenden herabgestuft)", async () => {
    await mkUser("temp1");
    await member(orgA, "temp1", "mentor");
    const m1 = await insertModule({ title: "Temp1", responsibleUserId: ids.temp1 });
    await getDb().delete(users).where(eq(users.id, ids.temp1));
    delete ids.temp1;
    expect((await getDb().select().from(companyModules).where(eq(companyModules.id, m1)))[0].responsibleUserId).toBeNull();

    await mkUser("temp2");
    await member(orgA, "temp2", "mentor");
    const m2 = await insertModule({ title: "Temp2", responsibleUserId: ids.temp2 });
    await getDb().update(organizationMemberships).set({ role: "learner" }).where(eq(organizationMemberships.userId, ids.temp2));
    const list = await listModulesForOrg(orgA);
    expect(list.find((m) => m.id === m1)).toMatchObject({ responsibleUserId: null, responsibleName: null });
    expect(list.find((m) => m.id === m2)).toMatchObject({ responsibleUserId: null, responsibleEmail: null });
    // der Verantwortliche lässt sich neu setzen
    expect((await patch("adminA", m2, { responsibleUserId: ids.adminA })).status).toBe(200);
  });

  it("Archivieren: nur eigene Firma, danach in keiner Liste und nicht mehr änderbar", async () => {
    signInAs(ids.adminB);
    expect((await deleteRoute(req("DELETE"), ctx(moduleId) as never)).status).toBe(404);
    signInAs(ids.learnerA);
    expect((await deleteRoute(req("DELETE"), ctx(moduleId) as never)).status).toBe(403);
    signInAs(ids.adminA);
    expect((await deleteRoute(req("DELETE"), ctx("kein-uuid") as never)).status).toBe(404);
    expect((await deleteRoute(req("DELETE"), ctx(moduleId) as never)).status).toBe(200);
    expect((await deleteRoute(req("DELETE"), ctx(moduleId) as never)).status).toBe(404);
    expect((await patch("adminA", moduleId, { title: "Zu spät" })).status).toBe(404);
    expect((await listModulesForOrg(orgA)).map((m) => m.id)).not.toContain(moduleId);
    expect(await getDb().select().from(companyModules).where(eq(companyModules.id, moduleId))).toHaveLength(1); // nur archiviert
  });
});
