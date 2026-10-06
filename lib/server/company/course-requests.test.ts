/**
 * Tests für Kundenanfragen nach allgemeinen Lernpfaden, Freigaben und den Prüfstatus (Phase 3) gegen eine
 * ECHTE Postgres-Datenbank. Wie company-access.test.ts nur mit TEST_DATABASE_URL, sonst übersprungen.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));
// Das Limit wirkt nur im eigenen Test (sonst würden die vielen Anfragen der anderen Tests es auslösen).
const limit = vi.hoisted(() => ({ enforce: false }));
vi.mock("@/lib/server/auth-rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/auth-rate-limit")>();
  return {
    ...real,
    checkCourseRequestRateLimit: (userId: string) =>
      limit.enforce ? real.checkCourseRequestRateLimit(userId) : { allowed: true, retryAfterSeconds: 0 },
  };
});

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
import { GET as customerList, POST as customerCreate } from "@/app/api/company/course-requests/route";
import { POST as assignRoute } from "@/app/api/company/assignments/route";
import { GET as adminList } from "@/app/api/admin/course-requests/route";
import { PATCH as adminStatus } from "@/app/api/admin/course-requests/[id]/route";
import { POST as adminRelease } from "@/app/api/admin/course-requests/[id]/release/route";
import { PATCH as adminCatalog } from "@/app/api/admin/certifications/[certId]/catalog/route";
import { listAssignableLearningPaths } from "./assignments";
import { COURSE_REQUEST_VIEW_FIELDS } from "./course-requests";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (userId: string | null) => authMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const certCtx = (certId: string) => ({ params: Promise.resolve({ certId }) });

run("Kundenanfragen, Freigaben, Prüfstatus (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  const certIds: Record<string, string> = {};
  let orgA = "";
  let orgB = "";

  async function makeUser(key: string, role: "learner" | "admin" = "learner") {
    const [u] = await getDb().insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key, role }).returning({ id: users.id });
    ids[key] = u.id;
  }
  const addMember = (orgId: string, key: string, role: CompanyRole) =>
    getDb().insert(organizationMemberships).values({ organizationId: orgId, userId: ids[key], role });
  async function makeCert(key: string, extra: Partial<typeof certifications.$inferInsert> = {}) {
    const [c] = await getDb()
      .insert(certifications)
      .values({ slug: `kurs-${key}-${tag}`, name: `Kurs ${key} ${tag}`, provider: "T", examName: "T", examVersion: "1", ...extra })
      .returning({ id: certifications.id });
    certIds[key] = c.id;
  }
  async function request(asKey: string, body: Record<string, unknown>) {
    signInAs(ids[asKey]);
    return customerCreate(req("POST", body));
  }
  async function myRequests(asKey: string) {
    signInAs(ids[asKey]);
    return (await (await customerList()).json()) as { requests: Record<string, unknown>[]; catalog: { id: string; name: string }[] };
  }
  async function admin(handler: (r: Request, c: never) => Promise<Response>, r: Request, c?: unknown) {
    signInAs(ids.operator);
    return handler(r, c as never);
  }

  beforeAll(async () => {
    const db = getDb();
    orgA = (await db.insert(organizations).values({ name: `ReqA ${tag}` }).returning())[0].id;
    orgB = (await db.insert(organizations).values({ name: `ReqB ${tag}` }).returning())[0].id;
    await makeUser("operator", "admin");
    for (const k of ["adminA", "mentorA", "learnerA", "adminB", "loner"]) await makeUser(k);
    await addMember(orgA, "adminA", "company_admin");
    await addMember(orgA, "mentorA", "mentor");
    await addMember(orgA, "learnerA", "learner");
    await addMember(orgB, "adminB", "company_admin");
    await makeCert("security");
    await makeCert("cloud");
    await makeCert("entwurf", { catalogStatus: "draft" });
    await makeCert("pruefung", { catalogStatus: "in_review" });
    await makeCert("intern", { kind: "internal", ownerOrganizationId: orgA });
  });
  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(certifications).where(inArray(certifications.id, Object.values(certIds)));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  it("Zugriff: Kundenseite nur Firmen-Admin und Mentor, Betreiberseite nur Plattform-Admin", async () => {
    signInAs(null);
    expect((await customerList()).status).toBe(401);
    expect((await adminList()).status).toBe(401);
    for (const k of ["learnerA", "loner"]) {
      signInAs(ids[k]);
      expect((await customerList()).status, k).toBe(403);
      expect((await customerCreate(req("POST", { wishTitle: "Etwas Neues" }))).status, k).toBe(403);
    }
    // ein Firmen-Admin hat auf der Betreiberseite keine Rechte
    for (const k of ["adminA", "mentorA", "learnerA"]) {
      signInAs(ids[k]);
      expect((await adminList()).status, k).toBe(403);
      expect((await adminStatus(req("PATCH", { status: "on_hold" }), ctx(randomUUID()))).status, k).toBe(403);
      expect((await adminRelease(req("POST", {}), ctx(randomUUID()))).status, k).toBe(403);
      expect((await adminCatalog(req("PATCH", { status: "approved", approvedByName: "X Y" }), certCtx(certIds.security))).status, k).toBe(403);
    }
    expect(await getDb().select().from(courseRequests).where(eq(courseRequests.organizationId, orgA))).toHaveLength(0);
  });

  it("Katalog der Firma: nur freigegebene allgemeine Lernpfade, keine Entwürfe, keine fremden internen", async () => {
    for (const k of ["adminA", "adminB"]) {
      const { catalog } = await myRequests(k);
      const names = catalog.map((c) => c.id);
      expect(names, k).toEqual(expect.arrayContaining([certIds.security, certIds.cloud]));
      expect(names, k).not.toContain(certIds.entwurf);
      expect(names, k).not.toContain(certIds.pruefung);
      expect(names, k).not.toContain(certIds.intern);
    }
  });

  let reqSecurity = "";
  let reqWish = "";
  it("Anfrage aus dem Katalog und freier Wunsch: Stand „Eingegangen“, Verlauf beginnt", async () => {
    const a = await request("adminA", { certificationId: certIds.security });
    expect(a.status).toBe(201);
    reqSecurity = (await a.json()).id;
    const w = await request("mentorA", { wishTitle: "  Kubernetes für Einsteiger ", wishDescription: "Für das Plattform-Team, 2 Stunden." });
    expect(w.status).toBe(201);
    reqWish = (await w.json()).id;

    const rows = await getDb().select().from(courseRequests).where(eq(courseRequests.organizationId, orgA));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === reqWish)).toMatchObject({ wishTitle: "Kubernetes für Einsteiger", status: "submitted", certificationId: null, requestedByUserId: ids.mentorA });
    expect(rows.find((r) => r.id === reqSecurity)).toMatchObject({ certificationId: certIds.security, wishTitle: null, status: "submitted" });
    const events = await getDb().select().from(courseRequestEvents).where(eq(courseRequestEvents.requestId, reqSecurity));
    expect(events.map((e) => e.status)).toEqual(["submitted"]);
  });

  it("ungültige oder unzulässige Anfragen", async () => {
    expect((await request("adminA", {})).status).toBe(400); // weder noch
    expect((await request("adminA", { certificationId: certIds.cloud, wishTitle: "Beides" })).status).toBe(400);
    expect((await request("adminA", { wishTitle: "ab" })).status).toBe(400);
    expect((await request("adminA", { wishTitle: "x".repeat(201) })).status).toBe(400);
    expect((await request("adminA", { wishTitle: "Gültig", wishDescription: "x".repeat(2001) })).status).toBe(400);
    expect((await request("adminA", { certificationId: "kein-uuid" })).status).toBe(400);
    expect((await request("adminA", { certificationId: certIds.security })).status).toBe(409); // läuft schon
    for (const key of ["entwurf", "pruefung", "intern"]) {
      expect((await request("adminA", { certificationId: certIds[key] })).status, key).toBe(404); // nicht im Katalog
    }
    expect((await request("adminA", { certificationId: randomUUID() })).status).toBe(404);
    expect(await getDb().select().from(courseRequests).where(eq(courseRequests.organizationId, orgA))).toHaveLength(2);
  });

  it("Mandantentrennung: jede Firma sieht nur ihre Anfragen; eine mitgeschickte organizationId zählt nicht", async () => {
    const forged = await request("adminB", { wishTitle: "Fremder Wunsch", organizationId: orgA });
    expect(forged.status).toBe(201);
    const [row] = await getDb().select().from(courseRequests).where(eq(courseRequests.id, (await forged.json()).id));
    expect(row.organizationId).toBe(orgB);

    const a = await myRequests("adminA");
    expect(a.requests.map((r) => r.id).sort()).toEqual([reqSecurity, reqWish].sort());
    const b = await myRequests("adminB");
    expect(b.requests).toHaveLength(1);
    expect(b.requests[0].wishTitle).toBe("Fremder Wunsch");
    // Firma B kann denselben Katalog-Lernpfad unabhängig anfragen
    expect((await request("adminB", { certificationId: certIds.security })).status).toBe(201);
  });

  it("Betreiber sieht alle Anfragen mit Firma und Anfragendem; die Firma sieht nur freigegebene Felder", async () => {
    const res = await admin(adminList, new Request("http://localhost"));
    const body = await res.json();
    const mine = body.requests.filter((r: { organizationId: string }) => [orgA, orgB].includes(r.organizationId));
    expect(mine.length).toBe(4);
    expect(mine.find((r: { id: string }) => r.id === reqWish)).toMatchObject({ organizationName: `ReqA ${tag}`, requesterEmail: `mentorA-${tag}@test.example`, status: "submitted" });
    expect(body.catalog.length).toBeGreaterThanOrEqual(5);

    const { requests } = await myRequests("adminA");
    for (const r of requests) expect(Object.keys(r).sort()).toEqual([...COURSE_REQUEST_VIEW_FIELDS].sort());
    expect(JSON.stringify(requests)).not.toContain(ids.operator);
    expect(JSON.stringify(requests)).not.toContain("operator-");
  });

  it("Stand und Hinweis setzen: die Firma sieht „hold“ mit Hinweis und den Verlauf", async () => {
    const ok = await admin(adminStatus, req("PATCH", { status: "on_hold", note: "Kurs wird neu erstellt, voraussichtlich KW 44" }), ctx(reqWish));
    expect(ok.status).toBe(204);
    await admin(adminStatus, req("PATCH", { status: "in_creation" }), ctx(reqWish));
    const { requests } = await myRequests("mentorA");
    const wish = requests.find((r) => r.id === reqWish) as { status: string; statusNote: string | null; events: { status: string; note: string | null }[] };
    expect(wish.status).toBe("in_creation");
    expect(wish.statusNote).toBeNull(); // neuer Stand ohne Hinweis ersetzt den alten
    expect(wish.events.map((e) => e.status)).toEqual(["submitted", "on_hold", "in_creation"]);
    expect(wish.events[1].note).toBe("Kurs wird neu erstellt, voraussichtlich KW 44");
  });

  it("Statusregeln: Ablehnung braucht Begründung, „freigegeben“ nur über die Freigabe, Unbekanntes 404/400", async () => {
    expect((await admin(adminStatus, req("PATCH", { status: "rejected" }), ctx(reqWish))).status).toBe(409);
    expect((await admin(adminStatus, req("PATCH", { status: "released" }), ctx(reqWish))).status).toBe(400);
    expect((await admin(adminStatus, req("PATCH", { status: "quatsch" }), ctx(reqWish))).status).toBe(400);
    expect((await admin(adminStatus, req("PATCH", { status: "on_hold", note: "x".repeat(501) }), ctx(reqWish))).status).toBe(400);
    expect((await admin(adminStatus, req("PATCH", { status: "on_hold" }), ctx(randomUUID()))).status).toBe(404);
    expect((await admin(adminStatus, req("PATCH", { status: "on_hold" }), ctx("kein-uuid"))).status).toBe(404);
    const [row] = await getDb().select().from(courseRequests).where(eq(courseRequests.id, reqWish));
    expect(row.status).toBe("in_creation");
  });

  it("Freigabe eines vorhandenen Lernpfads: Firma darf ihn danach zuweisen, vorher und andere Firmen nicht", async () => {
    const assign = async (asKey: string, cert: string, userKey: string) => {
      signInAs(ids[asKey]);
      return assignRoute(req("POST", { userIds: [ids[userKey]], certificationId: cert }));
    };
    expect((await assign("adminA", certIds.security, "learnerA")).status).toBe(404); // noch nicht freigegeben
    expect((await listAssignableLearningPaths(orgA)).map((p) => p.id)).not.toContain(certIds.security);

    const res = await admin(adminRelease, req("POST", { note: "Freigegeben, viel Erfolg" }), ctx(reqSecurity));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ organizationId: orgA, certificationId: certIds.security });

    expect((await getDb().select().from(companyCourseEntitlements).where(eq(companyCourseEntitlements.organizationId, orgA))).map((e) => e.certificationId)).toEqual([certIds.security]);
    const paths = await listAssignableLearningPaths(orgA);
    expect(paths.find((p) => p.id === certIds.security)).toMatchObject({ kind: "general" });
    expect((await assign("adminA", certIds.security, "learnerA")).status).toBe(201);
    expect((await assign("adminB", certIds.security, "adminB")).status).toBe(404); // B hat keine Freigabe
    expect((await listAssignableLearningPaths(orgB)).map((p) => p.id)).not.toContain(certIds.security);

    const { requests, catalog } = await myRequests("adminA");
    expect(requests.find((r) => r.id === reqSecurity)).toMatchObject({ status: "released", statusNote: "Freigegeben, viel Erfolg" });
    expect(catalog.map((c) => c.id)).not.toContain(certIds.security); // schon freigegeben, nicht noch einmal anfragbar
    expect((await request("adminA", { certificationId: certIds.security })).status).toBe(409);
  });

  it("Freigabe ist endgültig und doppelt nicht möglich", async () => {
    expect((await admin(adminRelease, req("POST", {}), ctx(reqSecurity))).status).toBe(409);
    expect((await admin(adminStatus, req("PATCH", { status: "on_hold" }), ctx(reqSecurity))).status).toBe(409);
  });

  it("freier Wunsch: Freigabe braucht erst einen Lernpfad, und der muss fachlich freigegeben und allgemein sein", async () => {
    expect((await admin(adminRelease, req("POST", {}), ctx(reqWish))).status).toBe(400); // noch kein Lernpfad
    const before = (await getDb().select().from(companyCourseEntitlements).where(eq(companyCourseEntitlements.organizationId, orgA))).length;
    for (const key of ["entwurf", "pruefung", "intern"]) {
      const res = await admin(adminRelease, req("POST", { certificationId: certIds[key] }), ctx(reqWish));
      expect(res.status, key).toBe(409);
    }
    expect((await admin(adminRelease, req("POST", { certificationId: randomUUID() }), ctx(reqWish))).status).toBe(404);
    expect((await getDb().select().from(companyCourseEntitlements).where(eq(companyCourseEntitlements.organizationId, orgA))).length).toBe(before);
    const [still] = await getDb().select().from(courseRequests).where(eq(courseRequests.id, reqWish));
    expect(still.status).not.toBe("released");

    // erst nach der fachlichen Prüfung (Name und Datum) geht es
    const noName = await admin(adminCatalog, req("PATCH", { status: "approved" }), certCtx(certIds.pruefung));
    expect(noName.status).toBe(400);
    const approved = await admin(adminCatalog, req("PATCH", { status: "approved", approvedByName: "  Dr. Erika Prüfer (extern) " }), certCtx(certIds.pruefung));
    expect(approved.status).toBe(204);
    const [cert] = await getDb().select().from(certifications).where(eq(certifications.id, certIds.pruefung));
    expect(cert).toMatchObject({ catalogStatus: "approved", approvedByName: "Dr. Erika Prüfer (extern)" });
    expect(cert.approvedAt).not.toBeNull();

    const ok = await admin(adminRelease, req("POST", { certificationId: certIds.pruefung, note: "Ihr Kurs ist fertig" }), ctx(reqWish));
    expect(ok.status).toBe(200);
    const { requests } = await myRequests("mentorA");
    expect(requests.find((r) => r.id === reqWish)).toMatchObject({ status: "released", courseName: `Kurs pruefung ${tag}`, statusNote: "Ihr Kurs ist fertig" });
    expect((await listAssignableLearningPaths(orgA)).map((p) => p.id)).toContain(certIds.pruefung);
  });

  it("Freigabe zurücknehmen: nicht mehr zuweisbar, bestehende Zuweisungen und Firmenfreigabe bleiben", async () => {
    const back = await admin(adminCatalog, req("PATCH", { status: "in_review" }), certCtx(certIds.security));
    expect(back.status).toBe(204);
    const [cert] = await getDb().select().from(certifications).where(eq(certifications.id, certIds.security));
    expect(cert).toMatchObject({ catalogStatus: "in_review", approvedByName: null, approvedAt: null });
    expect((await listAssignableLearningPaths(orgA)).map((p) => p.id)).not.toContain(certIds.security);
    expect(await getDb().select().from(companyCourseEntitlements).where(and(eq(companyCourseEntitlements.organizationId, orgA), eq(companyCourseEntitlements.certificationId, certIds.security)))).toHaveLength(1);
    expect(await getDb().select().from(companyAssignments).where(eq(companyAssignments.certificationId, certIds.security))).toHaveLength(1);
    expect((await admin(adminCatalog, req("PATCH", { status: "draft" }), certCtx(randomUUID()))).status).toBe(404);
    expect((await admin(adminCatalog, req("PATCH", { status: "geheim" }), certCtx(certIds.security))).status).toBe(400);
  });

  it("interne Lernpfade: nur die eigene Firma sieht und weist sie zu (ohne Freigabe), nur solange sie geprüft sind", async () => {
    const internal = (orgId: string) => listAssignableLearningPaths(orgId).then((l) => l.find((p) => p.id === certIds.intern));
    expect(await internal(orgA)).toMatchObject({ kind: "internal" });
    expect(await internal(orgB)).toBeUndefined();

    const assign = async (asKey: string, userKey: string) => {
      signInAs(ids[asKey]);
      return assignRoute(req("POST", { userIds: [ids[userKey]], certificationId: certIds.intern }));
    };
    expect((await assign("adminB", "adminB")).status).toBe(404); // fremde interne Lernpfade sind nicht auffindbar
    expect((await assign("adminA", "learnerA")).status).toBe(201);
    // allgemeine Anfragen kennen interne Lernpfade nicht
    expect((await request("adminA", { certificationId: certIds.intern })).status).toBe(404);

    await admin(adminCatalog, req("PATCH", { status: "draft" }), certCtx(certIds.intern));
    expect(await internal(orgA)).toBeUndefined(); // ungeprüft: auch der Eigentümer kann nichts Neues zuweisen
    expect((await assign("adminA", "mentorA")).status).toBe(404);
  });

  it("Rate-Limit: höchstens 10 Anfragen pro Stunde und Person", async () => {
    limit.enforce = true;
    try {
      let last = 0;
      for (let i = 0; i < 11; i++) last = (await request("adminB", {})).status;
      expect(last).toBe(429);
    } finally {
      limit.enforce = false;
    }
  });

  it("Audit: Anfrage, Statusänderung, Freigabe und Prüfstatus sind protokolliert", async () => {
    const events = await getDb().select().from(auditEvents).where(inArray(auditEvents.actorUserId, [ids.adminA, ids.mentorA, ids.operator]));
    const actions = new Set(events.map((e) => e.action));
    for (const a of ["course_request.created", "course_request.status_changed", "course_request.released", "certification.catalog_status_changed"]) {
      expect(actions, a).toContain(a);
    }
  });
});
