/** Aufgabe 17 (Review 12.11.2026): Selbstauskünfte speichern, abschalten, exportieren, Fragemüdigkeit (nur mit TEST_DATABASE_URL). */
import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

vi.mock("@/lib/server/auth-guards", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/server/auth-guards";
import { exportAccountData } from "@/lib/server/account/export";
import { getDb } from "@/lib/server/db/client";
import { studySessions } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { GET, POST } from "@/app/api/self-reports/route";
import { PUT } from "@/app/api/self-reports/settings/route";
import { canAskSelfReport, getSelfReportSettings, listSelfReports, recordSelfReport, setSelfReportEnabled } from "./service";

const run = TEST_DB ? describe : describe.skip;
const DAY = 86_400_000;

async function sessionOf(userId: string) {
  const course = await seedCourse(1);
  const [row] = await getDb().insert(studySessions).values({ userId, certificationId: course.certId, status: "in_progress", goalType: "questions", goalValue: 1 }).returning();
  return row.id;
}

const json = (body: unknown) => new Request("http://localhost/api/self-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

afterEach(() => {
  delete process.env.FEATURE_SELF_REPORTS;
});

run("Selbstauskünfte (echte DB)", () => {
  it("Akzeptanz: speichern, abschalten und exportieren", async () => {
    const userId = await seedUser();
    expect(await recordSelfReport(userId, { kind: "effort", value: 4, refType: "section", refId: crypto.randomUUID() })).toMatchObject({ ok: true, skipped: false });
    expect((await listSelfReports(userId))[0]).toMatchObject({ kind: "effort", value: "4", refType: "section" });

    await setSelfReportEnabled(userId, "effort", false);
    expect((await getSelfReportSettings(userId)).find((s) => s.kind === "effort")).toMatchObject({ enabled: false });
    expect(await recordSelfReport(userId, { kind: "effort", value: 2 })).toEqual({ ok: false, reason: "disabled" });
    expect(await canAskSelfReport(userId, "retention_forecast")).toEqual({ ok: true });

    const data = (await exportAccountData(userId))!;
    const learning = data.learning as Record<string, Array<Record<string, unknown>>>;
    expect(learning.selfReports).toHaveLength(1);
    expect(learning.selfReports[0]).toMatchObject({ kind: "effort", value: "4" });
    expect(learning.selfReportSettings[0]).toMatchObject({ kind: "effort", enabled: false });
  });

  it("Akzeptanz: dreimal in Folge übersprungen pausiert die Frage 30 Tage, danach zählt es neu", async () => {
    const userId = await seedUser();
    const now = new Date();
    expect(await recordSelfReport(userId, { kind: "effort", value: null }, now)).toEqual({ ok: true, skipped: true, pausedUntil: null });
    await recordSelfReport(userId, { kind: "effort", value: null }, now);
    const third = await recordSelfReport(userId, { kind: "effort", value: null }, now);
    expect(third).toEqual({ ok: true, skipped: true, pausedUntil: new Date(now.getTime() + 30 * DAY) });

    expect(await canAskSelfReport(userId, "effort", { now: new Date(now.getTime() + 29 * DAY) })).toEqual({ ok: false, reason: "paused" });
    expect(await recordSelfReport(userId, { kind: "effort", value: 3 }, new Date(now.getTime() + 29 * DAY))).toEqual({ ok: false, reason: "paused" });
    // andere Arten bleiben frei
    expect(await canAskSelfReport(userId, "retention_forecast", { now })).toEqual({ ok: true });
    // nach 30 Tagen wieder gefragt; ein einzelnes Überspringen pausiert nicht sofort wieder
    const later = new Date(now.getTime() + 31 * DAY);
    expect(await canAskSelfReport(userId, "effort", { now: later })).toEqual({ ok: true });
    expect(await recordSelfReport(userId, { kind: "effort", value: null }, later)).toMatchObject({ ok: true, pausedUntil: null });
  });

  it("eine Antwort unterbricht die Folge", async () => {
    const userId = await seedUser();
    await recordSelfReport(userId, { kind: "work_relevance", value: null });
    await recordSelfReport(userId, { kind: "work_relevance", value: null });
    await recordSelfReport(userId, { kind: "work_relevance", value: "yes" });
    expect(await recordSelfReport(userId, { kind: "work_relevance", value: null })).toMatchObject({ ok: true, pausedUntil: null });
    expect(await canAskSelfReport(userId, "work_relevance")).toEqual({ ok: true });
  });

  it("höchstens eine Frage je Sitzung, auch übersprungen; nur eigene Sitzungen", async () => {
    const userId = await seedUser();
    const sessionId = await sessionOf(userId);
    expect(await recordSelfReport(userId, { kind: "effort", value: null, sessionId })).toMatchObject({ ok: true });
    expect(await canAskSelfReport(userId, "retention_forecast", { sessionId })).toEqual({ ok: false, reason: "session_limit" });
    expect(await recordSelfReport(userId, { kind: "retention_forecast", value: 50, sessionId })).toEqual({ ok: false, reason: "session_limit" });
    expect(await recordSelfReport(userId, { kind: "retention_forecast", value: 50, sessionId: await sessionOf(userId) })).toMatchObject({ ok: true });
    const other = await seedUser();
    expect(await recordSelfReport(other, { kind: "effort", value: 1, sessionId: await sessionOf(userId) })).toEqual({ ok: false, reason: "session_not_found" });
  });

  it("ungültige Werte und abgeschaltetes Flag", async () => {
    const userId = await seedUser();
    expect(await recordSelfReport(userId, { kind: "effort", value: 9 })).toEqual({ ok: false, reason: "invalid_value" });
    process.env.FEATURE_SELF_REPORTS = "0";
    expect(await recordSelfReport(userId, { kind: "effort", value: 3 })).toEqual({ ok: false, reason: "flag_off" });
    expect(await listSelfReports(userId)).toEqual([]);
  });

  it("API: speichern, lesen, abschalten", async () => {
    const userId = await seedUser();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId } as never);
    expect((await POST(json({ kind: "learning_reason", value: "interest", refType: "course", refId: crypto.randomUUID() }))).status).toBe(200);
    expect((await POST(json({ kind: "learning_reason", value: "fun" }))).status).toBe(400);
    expect((await POST(json({ kind: "mood", value: 1 }))).status).toBe(400);
    const put = await PUT(new Request("http://localhost/api/self-reports/settings", { method: "PUT", body: JSON.stringify({ kind: "learning_reason", enabled: false }) }));
    expect(put.status).toBe(204);
    expect((await POST(json({ kind: "learning_reason", value: "job" }))).status).toBe(409);
    const body = await (await GET()).json();
    expect(body.reports).toHaveLength(1);
    expect(body.settings.find((s: { kind: string }) => s.kind === "learning_reason")).toMatchObject({ enabled: false });
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});
