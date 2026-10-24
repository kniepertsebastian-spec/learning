/** Probe-Review gegen echte DB (nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { probeSets, users } from "@/lib/server/db/schema";
import { seedUser } from "@/lib/server/psrp/test-db";
import type { ProbeItemDraft } from "@/lib/reviewers/probe";
import { ProfileError, publishProfile, saveExperience, saveProfile } from "./profile-service";
import { assertQualified, createProbeSet, deleteProbeSet, getAttemptView, getProbeOverview, getProbeSetForAdmin, isQualified, listProbeAttemptsForAdmin, listReviewerQualifications, NotQualifiedError, ProbeError, saveProbeSet, setQualification, setReport, startAttempt, submitAttempt } from "./probe-service";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 6);

const item = (n: number, planted = false): ProbeItemDraft => ({
  question: `Frage ${n} ${tag}?`,
  options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }, { text: "c", isCorrect: false }, { text: "d", isCorrect: false }],
  explanation: "Weil.",
  plantedError: planted ? { type: "wrong_key", note: `Geheimer Hinweis ${n}` } : null,
});
const items = (planted = 5): ProbeItemDraft[] => Array.from({ length: 16 }, (_, i) => item(i + 1, i < planted));

run("Probe-Review (echte DB)", () => {
  const setIds: string[] = [];
  afterAll(async () => {
    if (setIds.length) await getDb().delete(probeSets).where(inArray(probeSets.id, setIds));
  });
  async function activeSet(planted = 5) {
    const admin = await seedUser();
    const id = await createProbeSet(admin, { title: `Satz ${tag}`, topic: "Netzwerk", language: "de" });
    setIds.push(id);
    await saveProbeSet(id, { title: `Satz ${tag}`, topic: "Netzwerk", language: "de", active: true, items: items(planted) });
    return id;
  }
  async function candidate() {
    const id = await seedUser();
    await getDb().update(users).set({ role: "reviewer" }).where(eq(users.id, id));
    return id;
  }
  const reportItems = async (userId: string, attemptId: string, which: number[]) => {
    const view = (await getAttemptView(userId, attemptId))!;
    for (const i of which) await setReport(userId, attemptId, view.items[i].id, { type: "wrong_key", text: "Der Schlüssel stimmt nicht." });
  };

  it("Satz: nur gültig aktivierbar, Fragen nach Versuchen gesperrt, mit Versuchen nicht löschbar", async () => {
    const admin = await seedUser();
    const id = await createProbeSet(admin, { title: "T", topic: "X", language: "de" });
    setIds.push(id);
    await expect(saveProbeSet(id, { title: "T", topic: "X", language: "de", active: true, items: items().slice(0, 10) })).rejects.toMatchObject({ problems: expect.arrayContaining([expect.stringContaining("15 bis 20")]) });
    await saveProbeSet(id, { title: "T", topic: "X", language: "de", active: false, items: items().slice(0, 10) }); // Entwurf darf unvollständig sein
    await saveProbeSet(id, { title: "T", topic: "X", language: "de", active: true, items: items() });
    const user = await candidate();
    const attempt = await startAttempt(user, id);
    await expect(saveProbeSet(id, { title: "T", topic: "X", language: "de", active: true, items: items(4) })).rejects.toBeInstanceOf(ProbeError);
    await saveProbeSet(id, { title: "Neuer Titel", topic: "X", language: "de", active: false, items: items() }); // Titel und Aktiv gehen weiter
    expect((await getProbeSetForAdmin(id))!.attempts).toBe(1);
    await expect(deleteProbeSet(id)).rejects.toBeInstanceOf(ProbeError);
    expect(attempt).toBeTruthy();
  });

  it("Kandidat sieht keine eingebauten Fehler; Bestehen schaltet Freigaberechte frei; Ergebnis nur für Admin", async () => {
    const setId = await activeSet();
    const user = await candidate();
    expect(await isQualified(user)).toBe(false);
    await expect(assertQualified(user)).rejects.toBeInstanceOf(NotQualifiedError);
    const overview = await getProbeOverview(user);
    expect(overview.available.map((s) => s.id)).toContain(setId);

    const attemptId = await startAttempt(user, setId);
    expect(await startAttempt(user, setId)).toBe(attemptId); // offener Versuch wird fortgesetzt
    const view = (await getAttemptView(user, attemptId))!;
    expect(view.items).toHaveLength(16);
    expect(JSON.stringify(view)).not.toContain("Geheimer Hinweis");
    expect(JSON.stringify(view)).not.toContain("plantedError");

    await reportItems(user, attemptId, [0, 1, 2, 3, 10]); // 4 von 5 gefunden, 1 Fehlalarm
    const outcome = await submitAttempt(user, attemptId);
    expect(outcome).toEqual({ passed: true, nextAttemptAt: null });
    expect(await isQualified(user)).toBe(true);
    expect((await getProbeOverview(user)).available).toEqual([]);

    const mine = (await listProbeAttemptsForAdmin()).find((a) => a.id === attemptId)!;
    expect(mine.result).toEqual({ found: 4, plantedTotal: 5, falseAlarms: 1, passed: true });
    expect(mine.extraNotes).toHaveLength(1); // der Fehlalarm mit Begründung für den Admin
    await expect(submitAttempt(user, attemptId)).rejects.toBeInstanceOf(ProbeError); // schon abgegeben
    await expect(setReport(user, attemptId, view.items[0].id, null)).rejects.toBeInstanceOf(ProbeError);
  });

  it("Nicht bestanden: keine Rechte, 30 Tage Wartezeit, danach nur ein anderer Satz", async () => {
    const first = await activeSet();
    const second = await activeSet();
    const user = await candidate();
    const t0 = new Date("2026-10-01T10:00:00Z");
    const attemptId = await startAttempt(user, first, t0);
    await reportItems(user, attemptId, [0, 1]); // 2 von 5
    const outcome = await submitAttempt(user, attemptId, t0);
    expect(outcome.passed).toBe(false);
    expect(outcome.nextAttemptAt?.toISOString()).toBe("2026-10-31T10:00:00.000Z");
    expect(await isQualified(user)).toBe(false);

    const during = await getProbeOverview(user, new Date("2026-10-15T00:00:00Z"));
    expect(during.available).toEqual([]);
    expect(during.blockedUntil?.toISOString()).toBe("2026-10-31T10:00:00.000Z");
    await expect(startAttempt(user, second, new Date("2026-10-15T00:00:00Z"))).rejects.toBeInstanceOf(ProbeError);

    const after = await getProbeOverview(user, new Date("2026-11-01T00:00:00Z"));
    expect(after.available.map((s) => s.id)).toContain(second);
    expect(after.available.map((s) => s.id)).not.toContain(first); // anderer Satz
    await expect(startAttempt(user, first, new Date("2026-11-01T00:00:00Z"))).rejects.toBeInstanceOf(ProbeError);
    expect(await startAttempt(user, second, new Date("2026-11-01T00:00:00Z"))).toBeTruthy();
  });

  it("Meldungen: Art und Begründung nötig, je Frage eine, Rücknahme möglich; fremde Versuche sind unzugänglich", async () => {
    const setId = await activeSet();
    const user = await candidate();
    const other = await candidate();
    const attemptId = await startAttempt(user, setId);
    const view = (await getAttemptView(user, attemptId))!;
    await expect(setReport(user, attemptId, view.items[0].id, { type: "wrong_key", text: "x" })).rejects.toBeInstanceOf(ProbeError);
    await setReport(user, attemptId, view.items[0].id, { type: "wrong_key", text: "Erste Begründung" });
    await setReport(user, attemptId, view.items[0].id, { type: "outdated", text: "Zweite Begründung" });
    expect((await getAttemptView(user, attemptId))!.reports).toEqual([{ itemId: view.items[0].id, type: "outdated", text: "Zweite Begründung" }]);
    await setReport(user, attemptId, view.items[0].id, null);
    expect((await getAttemptView(user, attemptId))!.reports).toEqual([]);
    expect(await getAttemptView(other, attemptId)).toBeNull();
    await expect(setReport(other, attemptId, view.items[0].id, { type: "wrong_key", text: "Fremd" })).rejects.toBeInstanceOf(ProbeError);
    await expect(submitAttempt(other, attemptId)).rejects.toBeInstanceOf(ProbeError);
  });

  it("Admin schaltet frei und zurück, nur Personen mit Prüfer-Rolle; ohne Rechte kein Veröffentlichen", async () => {
    const admin = await seedUser();
    const user = await candidate();
    const learner = await seedUser();
    expect(await setQualification(admin, learner, true)).toBe(false);
    await saveProfile(user, { firstName: "Pia", lastName: "Probe", country: "Deutschland", consent: { name: true, country: true } });
    await saveExperience(user, { kind: "job", title: "Admin", periodFrom: "2019", isPublic: true });
    await expect(publishProfile(user)).rejects.toBeInstanceOf(ProfileError);
    expect(await setQualification(admin, user, true)).toBe(true);
    expect((await listReviewerQualifications()).find((r) => r.userId === user)).toMatchObject({ qualified: true, source: "admin" });
    await publishProfile(user);
    expect(await setQualification(admin, user, false)).toBe(true);
    expect(await isQualified(user)).toBe(false);
  });
});
