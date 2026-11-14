/**
 * Datenschutztest Zertifikats-Register (UI U9) gegen echte DB, nur mit TEST_DATABASE_URL.
 * Ohne Freigabe sieht die Firma weder Zertifikat noch Termin; mit Freigabe nur die festgeschriebenen Felder; der Gutscheincode
 * erreicht nur die zugewiesene Person; der Audit-Export enthält nur Freigegebenes. Eine Mutationsprobe zeigt, dass der Test
 * auffällt, wenn die Freigabeprüfung entfällt.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || Buffer.alloc(32, 7).toString("base64");

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { auditEvents, certifications, examPlans, examVouchers, organizationMemberships, organizations, userCertificates, users } from "@/lib/server/db/schema";
import { GET as exportRoute } from "@/app/api/company/certificates/export/route";
import { POST as voucherPost } from "@/app/api/company/vouchers/route";
import { GET as codeRoute } from "@/app/api/vouchers/[id]/code/route";
import { PATCH as sharePatch } from "@/app/api/certificates/[id]/route";
import { POST as certPost } from "@/app/api/certificates/route";
import { PATCH as planPatch } from "@/app/api/exam-plans/[id]/route";
import { COMPANY_CERTIFICATE_FIELDS, COMPANY_PLANNED_EXAM_FIELDS, COMPANY_VOUCHER_FIELDS, getRegisterOverview, listCompanyCertificates, listSharedPlannedExams, listVouchers } from "./certificates";
import { createFromPassedExam } from "@/lib/server/certificates/person";
import { setPlanStatus } from "@/lib/server/exams/planner";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (id: string | null) => authMock.mockResolvedValue(id ? { user: { id } } : null);
const json = (method: string, body?: unknown) => new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

run("Zertifikats-Register: Datenschutz (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  let orgA = "";
  let orgB = "";
  let certId = "";
  const certs: Record<string, string> = {};
  let planShared = "";
  let planHidden = "";

  beforeAll(async () => {
    const db = getDb();
    for (const k of ["chef", "anna", "ben", "bAdmin", "bBob"]) {
      const [u] = await db.insert(users).values({ email: `${k}-${tag}@test.example`, passwordHash: "x", name: k }).returning({ id: users.id });
      ids[k] = u.id;
    }
    orgA = (await db.insert(organizations).values({ name: `A ${tag}` }).returning())[0].id;
    orgB = (await db.insert(organizations).values({ name: `B ${tag}` }).returning())[0].id;
    await db.insert(organizationMemberships).values([
      { organizationId: orgA, userId: ids.chef, role: "company_admin" }, { organizationId: orgA, userId: ids.anna, role: "learner" }, { organizationId: orgA, userId: ids.ben, role: "learner" },
      { organizationId: orgB, userId: ids.bAdmin, role: "company_admin" }, { organizationId: orgB, userId: ids.bBob, role: "learner" },
    ]);
    certId = (await db.insert(certifications).values({ slug: `cr-${tag}`, name: `Reg ${tag}`, provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id }))[0].id;
    const mk = async (key: string, userId: string, shared: boolean, expiresAt: Date | null) => {
      const [c] = await db.insert(userCertificates).values({ userId, certificationId: certId, title: `Zert ${key} ${tag}`, vendor: "V", earnedAt: inDays(-100), expiresAt, sharedWithCompany: shared }).returning({ id: userCertificates.id });
      certs[key] = c.id;
    };
    await mk("annaShared", ids.anna, true, inDays(60));
    await mk("annaHidden", ids.anna, false, inDays(400));
    await mk("benShared", ids.ben, true, inDays(-5));
    await mk("bobShared", ids.bBob, true, inDays(200)); // andere Firma
    planShared = (await db.insert(examPlans).values({ userId: ids.anna, certificationId: certId, scheduledAt: inDays(20), shareWithCompany: true }).returning({ id: examPlans.id }))[0].id;
    planHidden = (await db.insert(examPlans).values({ userId: ids.ben, certificationId: certId, scheduledAt: inDays(25), shareWithCompany: false }).returning({ id: examPlans.id }))[0].id;
  });
  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(certifications).where(eq(certifications.id, certId));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });

  it("ohne Freigabe sieht die Firma weder Zertifikat noch Termin; fremde Firmen erscheinen nie", async () => {
    const list = await listCompanyCertificates(orgA);
    const titles = list.map((c) => c.title);
    expect(titles).toContain(`Zert annaShared ${tag}`);
    expect(titles).toContain(`Zert benShared ${tag}`);
    expect(titles).not.toContain(`Zert annaHidden ${tag}`);
    expect(titles).not.toContain(`Zert bobShared ${tag}`);
    const planned = await listSharedPlannedExams(orgA);
    expect(planned.map((p) => p.id)).toEqual([planShared]);
    expect(planned.map((p) => p.id)).not.toContain(planHidden);
  });

  it("mit Freigabe nur die festgeschriebenen Felder (keine Punkte, Versuche, Lernstand)", async () => {
    const [c] = await listCompanyCertificates(orgA);
    expect(Object.keys(c).sort()).toEqual([...COMPANY_CERTIFICATE_FIELDS].sort());
    const [p] = await listSharedPlannedExams(orgA);
    expect(Object.keys(p).sort()).toEqual([...COMPANY_PLANNED_EXAM_FIELDS].sort());
    const keys = new Set<string>();
    const collect = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === "object" && !(v instanceof Date)) {
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          collect(x);
        }
      }
    };
    collect(await getRegisterOverview(orgA));
    expect([...keys].filter((k) => /score|attempt|mastery|evidence|share|reminder|userId/i.test(k))).toEqual([]);
    const statuses = Object.fromEntries((await listCompanyCertificates(orgA)).map((x) => [x.title, x.status]));
    expect(statuses[`Zert annaShared ${tag}`]).toBe("expiring");
    expect(statuses[`Zert benShared ${tag}`]).toBe("expired");
  });

  it("Person gibt frei und nimmt zurück; nur eigene Zertifikate", async () => {
    signInAs(ids.ben);
    expect((await sharePatch(json("PATCH", { sharedWithCompany: true }), ctx(certs.annaHidden))).status).toBe(404);
    signInAs(ids.anna);
    expect((await sharePatch(json("PATCH", { sharedWithCompany: true }), ctx(certs.annaHidden))).status).toBe(204);
    expect((await listCompanyCertificates(orgA)).map((c) => c.title)).toContain(`Zert annaHidden ${tag}`);
    expect((await sharePatch(json("PATCH", { sharedWithCompany: false }), ctx(certs.annaHidden))).status).toBe(204);
    expect((await listCompanyCertificates(orgA)).map((c) => c.title)).not.toContain(`Zert annaHidden ${tag}`);
    // Termin freigeben/zurücknehmen
    signInAs(ids.ben);
    expect((await planPatch(json("PATCH", { shareWithCompany: true }), ctx(planHidden))).status).toBe(204);
    expect((await listSharedPlannedExams(orgA)).map((p) => p.id)).toContain(planHidden);
    expect((await planPatch(json("PATCH", { shareWithCompany: false }), ctx(planHidden))).status).toBe(204);
  });

  it("Mutationsprobe: ohne Freigabeprüfung würde der Test durchfallen", async () => {
    const leaked = await listCompanyCertificates(orgA, new Date(), sql`true`);
    expect(leaked.map((c) => c.title)).toContain(`Zert annaHidden ${tag}`); // das Leck ist sichtbar …
    const leakedPlans = await listSharedPlannedExams(orgA, new Date(), sql`true`);
    expect(leakedPlans.map((p) => p.id)).toContain(planHidden);
    // … und genau das prüfen die Tests oben mit not.toContain – die Prüfung greift also tatsächlich.
    expect(leaked.map((c) => c.title).includes(`Zert annaHidden ${tag}`)).not.toBe((await listCompanyCertificates(orgA)).map((c) => c.title).includes(`Zert annaHidden ${tag}`));
  });

  it("Gutschein: Code nur für die zugewiesene Person, die Firma bekommt ihn nie zurück; Code liegt verschlüsselt", async () => {
    signInAs(ids.chef);
    const res = await voucherPost(json("POST", { certificationId: certId, assignedUserId: ids.anna, expiresAt: inDays(20).toISOString().slice(0, 10), note: "Q4", code: "GEHEIM-1234" }));
    expect(res.status).toBe(201);
    const created = await res.text();
    expect(created).not.toContain("GEHEIM");
    const { id } = JSON.parse(created) as { id: string };
    const [row] = await getDb().select().from(examVouchers).where(eq(examVouchers.id, id));
    expect(row.codeEncrypted).toBeTruthy();
    expect(row.codeEncrypted).not.toContain("GEHEIM");
    const vouchers = await listVouchers(orgA);
    const v = vouchers.find((x) => x.id === id)!;
    expect(Object.keys(v).sort()).toEqual([...COMPANY_VOUCHER_FIELDS].sort());
    expect(JSON.stringify(vouchers)).not.toContain("GEHEIM");
    expect(v.hasCode).toBe(true);
    expect(v.state).toBe("expiring");
    // nur die zugewiesene Person
    signInAs(ids.anna);
    expect(await (await codeRoute(json("GET"), ctx(id))).json()).toEqual({ code: "GEHEIM-1234" });
    signInAs(ids.ben);
    expect((await codeRoute(json("GET"), ctx(id))).status).toBe(404);
    signInAs(ids.chef);
    expect((await codeRoute(json("GET"), ctx(id))).status).toBe(404);
    signInAs(ids.bAdmin);
    expect((await codeRoute(json("GET"), ctx(id))).status).toBe(404);
    // Person außerhalb der Firma kann nicht zugewiesen werden, fremde Firma sieht ihn nicht
    signInAs(ids.chef);
    expect((await voucherPost(json("POST", { certificationId: certId, assignedUserId: ids.bBob, expiresAt: inDays(20).toISOString().slice(0, 10) }))).status).toBe(404);
    expect((await listVouchers(orgB)).map((x) => x.id)).not.toContain(id);
  });

  it("Audit-Export (CSV): nur Freigegebenes, mit Kopf, protokolliert; Lernende dürfen nicht exportieren", async () => {
    signInAs(ids.chef);
    const res = await exportRoute(new Request("http://localhost/api/company/certificates/export"));
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain(`A ${tag}`);
    expect(csv).toContain(`Zert annaShared ${tag}`);
    expect(csv).not.toContain(`Zert annaHidden ${tag}`);
    expect(csv).not.toContain(`Zert bobShared ${tag}`);
    expect(csv).toContain("Läuft bald ab");
    expect(csv).toContain("Abgelaufen");
    const pdf = await exportRoute(new Request("http://localhost/api/company/certificates/export?format=pdf"));
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    const audit = await getDb().select({ a: auditEvents.action }).from(auditEvents).where(eq(auditEvents.actorUserId, ids.chef));
    expect(audit.filter((a) => a.a === "certificate_register.export").length).toBeGreaterThanOrEqual(2);
    signInAs(ids.anna);
    expect((await exportRoute(new Request("http://localhost/api/company/certificates/export"))).status).toBe(403);
    signInAs(ids.bAdmin);
    expect(await (await exportRoute(new Request("http://localhost/api/company/certificates/export"))).text()).not.toContain(`Zert annaShared ${tag}`);
  });

  it("Eigene Zertifikate eintragen; „Bestanden“ im Prüfungsplaner legt eines an (nicht freigegeben)", async () => {
    signInAs(ids.ben);
    expect((await certPost(json("POST", { title: "Eigenes Zert", vendor: "X", earnedAt: "2026-01-01", expiresAt: "2025-01-01" }))).status).toBe(400);
    expect((await certPost(json("POST", { title: "Eigenes Zert", vendor: "X", earnedAt: "2026-01-01", expiresAt: "2029-01-01", evidenceUrl: "javascript:alert(1)" }))).status).toBe(400);
    expect((await certPost(json("POST", { title: "Eigenes Zert", vendor: "X", earnedAt: "2026-01-01", expiresAt: "2029-01-01" }))).status).toBe(201);
    await setPlanStatus(ids.ben, planHidden, "passed");
    const rows = await getDb().select().from(userCertificates).where(eq(userCertificates.userId, ids.ben));
    const fromExam = rows.find((r) => r.certificationId === certId && r.title === `Reg ${tag}`);
    expect(fromExam).toBeTruthy();
    expect(fromExam!.sharedWithCompany).toBe(false);
    expect(await createFromPassedExam(ids.ben, certId)).toBeNull(); // am selben Tag nicht doppelt
  });
});
