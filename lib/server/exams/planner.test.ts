/** Prüfungsplaner (UI U8) gegen echte DB, nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, examPlans, organizationMemberships, organizations, users } from "@/lib/server/db/schema";
import { POST as createRoute } from "@/app/api/exam-plans/route";
import { DELETE as deleteRoute, PATCH as patchRoute } from "@/app/api/exam-plans/[id]/route";
import { GET as icsRoute } from "@/app/api/exam-plans/[id]/ics/route";
import { listCompanyStatus, COMPANY_STATUS_FIELDS } from "@/lib/server/company/status";
import { getPlannerOverview } from "./planner";
import { runExamReminders } from "./reminders";
import { visibleCertificationsCondition } from "@/lib/server/catalog/visibility";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (id: string | null) => authMock.mockResolvedValue(id ? { user: { id } } : null);
const json = (method: string, body?: unknown) => new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

run("Prüfungsplaner (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  let certId = "";
  let draftId = "";
  let orgId = "";

  beforeAll(async () => {
    const db = getDb();
    for (const k of ["anna", "ben", "chef"]) {
      const [u] = await db.insert(users).values({ email: `${k}-${tag}@test.example`, passwordHash: "x", name: k }).returning({ id: users.id });
      ids[k] = u.id;
    }
    certId = (await db.insert(certifications).values({ slug: `pl-${tag}`, name: `Plan ${tag}`, provider: "T", examName: "T", examVersion: "1", examProvider: "linux_foundation", deliveryModes: ["online"], bookingUrl: "https://example.org/book" }).returning({ id: certifications.id }))[0].id;
    draftId = (await db.insert(certifications).values({ slug: `pl-d-${tag}`, name: `Entwurf ${tag}`, provider: "T", examName: "T", examVersion: "1", catalogStatus: "draft" }).returning({ id: certifications.id }))[0].id;
    orgId = (await db.insert(organizations).values({ name: `Org ${tag}` }).returning())[0].id;
    await db.insert(organizationMemberships).values([{ organizationId: orgId, userId: ids.anna, role: "learner" }, { organizationId: orgId, userId: ids.chef, role: "company_admin" }]);
  });
  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(certifications).where(inArray(certifications.id, [certId, draftId]));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });

  it("Termin eintragen → Countdown, Lernplan-Wochen und .ics stimmen", async () => {
    signInAs(ids.anna);
    const res = await createRoute(json("POST", { certificationId: certId, scheduledAt: inDays(23), deliveryMode: "online", weeklyGoalHours: 5 }));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const viewer = { id: ids.anna, role: "learner" as const };
    const overview = await getPlannerOverview(viewer, await visibleCertificationsCondition(viewer));
    expect(overview.next?.cert.id).toBe(certId);
    expect(overview.next?.daysLeft).toBe(23);
    expect(overview.weeks.length).toBeGreaterThanOrEqual(3);
    expect(overview.weeks[overview.weeks.length - 1].kind).toBe("review");
    expect(overview.readiness.scores).toEqual([null, null, null]);

    const ics = await icsRoute(new Request("http://localhost/api/x"), ctx(id));
    expect(ics.status).toBe(200);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    const text = await ics.text();
    expect(text).toContain("BEGIN:VEVENT");
    expect(text).toContain(`SUMMARY:Prüfung: Plan ${tag}`);
    expect(text).toContain("LOCATION:Online mit Aufsicht");
  });

  it("ein zweiter Eintrag für denselben Kurs ändert den offenen Plan, legt keinen neuen an", async () => {
    signInAs(ids.anna);
    await createRoute(json("POST", { certificationId: certId, scheduledAt: inDays(30), weeklyGoalHours: 6 }));
    const rows = await getDb().select().from(examPlans).where(eq(examPlans.userId, ids.anna));
    expect(rows).toHaveLength(1);
    expect(rows[0].weeklyGoalHours).toBe(6);
  });

  it("nicht sichtbare Kurse (Entwurf), fremde Pläne und Anonyme: 404/401", async () => {
    signInAs(ids.anna);
    expect((await createRoute(json("POST", { certificationId: draftId, scheduledAt: inDays(10) }))).status).toBe(404);
    const [plan] = await getDb().select().from(examPlans).where(eq(examPlans.userId, ids.anna));
    signInAs(ids.ben);
    expect((await patchRoute(json("PATCH", { status: "passed" }), ctx(plan.id))).status).toBe(404);
    expect((await deleteRoute(json("DELETE"), ctx(plan.id))).status).toBe(404);
    expect((await icsRoute(new Request("http://localhost/api/x"), ctx(plan.id))).status).toBe(404);
    signInAs(null);
    expect((await createRoute(json("POST", { certificationId: certId }))).status).toBe(401);
    expect((await icsRoute(new Request("http://localhost/api/x"), ctx(plan.id))).status).toBe(401);
  });

  it("Der Termin ist für die Firma nicht sichtbar: Statusansicht kennt keine Prüfungsdaten, share_with_company bleibt aus", async () => {
    const [plan] = await getDb().select().from(examPlans).where(eq(examPlans.userId, ids.anna));
    expect(plan.shareWithCompany).toBe(false);
    const status = await listCompanyStatus(orgId);
    for (const entry of status) expect(Object.keys(entry).sort()).toEqual([...COMPANY_STATUS_FIELDS].sort());
    expect(JSON.stringify(status)).not.toContain(plan.id);
  });

  it("Ergebnis eintragen und Plan löschen (nur eigene)", async () => {
    signInAs(ids.anna);
    const [plan] = await getDb().select().from(examPlans).where(eq(examPlans.userId, ids.anna));
    expect((await patchRoute(json("PATCH", { status: "passed" }), ctx(plan.id))).status).toBe(204);
    expect((await patchRoute(json("PATCH", { status: "bogus" }), ctx(plan.id))).status).toBe(400);
    expect((await deleteRoute(json("DELETE"), ctx(plan.id))).status).toBe(204);
    expect(await getDb().select().from(examPlans).where(eq(examPlans.id, plan.id))).toHaveLength(0);
  });

  it("Erinnerungen: einmal je Art, nicht bei Opt-out", async () => {
    const db = getDb();
    await db.insert(examPlans).values({ userId: ids.anna, certificationId: certId, scheduledAt: new Date(Date.now() + 3 * 86_400_000), voucherExpiresAt: new Date(Date.now() + 10 * 86_400_000) });
    const sent: string[] = [];
    const send = async (m: { to: string; subject: string }) => (sent.push(`${m.to}|${m.subject}`), true);
    const first = await runExamReminders(new Date(), send);
    expect(first.sent).toBeGreaterThanOrEqual(2);
    expect(sent.some((s) => s.includes("Voucher"))).toBe(true);
    const again = await runExamReminders(new Date(), send);
    expect(again.sent).toBe(0);
    await db.update(users).set({ examRemindersOptOut: true }).where(eq(users.id, ids.anna));
    await db.update(examPlans).set({ remindersSent: {} }).where(eq(examPlans.userId, ids.anna));
    sent.length = 0;
    const optOut = await runExamReminders(new Date(), send);
    expect(sent.filter((s) => s.startsWith(`anna-${tag}`))).toHaveLength(0);
    expect(optOut.skipped).toBeGreaterThanOrEqual(1);
  });
});
