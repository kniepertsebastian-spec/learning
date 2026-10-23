/** Reaktivierungs-Mails gegen echte DB (nur mit TEST_DATABASE_URL). */
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
Object.assign(process.env, { APP_BASE_URL: "https://learning.example", MAIL_SMTP_HOST: "smtp.invalid", MAIL_SMTP_USER: "u", MAIL_SMTP_PASSWORD: "p", MAIL_FROM: "Learning <noreply@learning.example>" }); // versendet wird nie: send ist ersetzt
process.env.AUTH_SECRET = "test-secret";

import { getDb } from "@/lib/server/db/client";
import { learningActivities, organizationMemberships, organizations, reactivationMessages, studySessions, users } from "@/lib/server/db/schema";
import type { MailMessage } from "@/lib/server/mail/mailer";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { reactivationStats, runReactivation } from "./service";

const run = TEST_DB ? describe : describe.skip;
const noon = new Date("2026-10-23T12:00:00Z");
const daysBefore = (days: number, base = noon) => new Date(base.getTime() - days * 86_400_000);

run("Reaktivierung (echte DB)", () => {
  afterEach(() => {
    delete process.env.FEATURE_REACTIVATION;
  });

  async function learner(idleDays: number) {
    const course = await seedCourse(1);
    const userId = await seedUser();
    await getDb().update(users).set({ timezone: "UTC", emailVerifiedAt: new Date() }).where(eq(users.id, userId));
    const at = daysBefore(idleDays);
    await getDb().insert(studySessions).values({ userId, certificationId: course.certId, status: "completed", goalType: "minutes", goalValue: 10, plannedAt: at, completedAt: at });
    return { userId, slug: course.certId };
  }
  const collect = () => {
    const mails: MailMessage[] = [];
    return { mails, send: async (m: MailMessage) => (mails.push(m), true) };
  };
  const mailsFor = async (userId: string, mails: MailMessage[]) => {
    const [u] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, userId));
    return mails.filter((m) => m.to === u.email);
  };

  it("nach 5 Tagen genau eine Mail mit Link und Abmeldung, danach Ruhe", async () => {
    const { userId } = await learner(5);
    const first = collect();
    await runReactivation(noon, first.send);
    const mine = await mailsFor(userId, first.mails);
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toContain("3 Minuten reichen heute");
    expect(mine[0].text).toMatch(/https:\/\/learning\.example\/cert\/.+\/restart/);
    expect(mine[0].text).toContain("/unsubscribe/reactivation?u=" + userId);
    expect(mine[0].text).not.toMatch(/\d+ (Fragen|Wiederholungen|Karten)/); // keine Rückstandszahl
    expect(mine[0].headers?.["List-Unsubscribe"]).toContain("/unsubscribe/reactivation");

    const again = collect();
    await runReactivation(new Date(noon.getTime() + 3_600_000), again.send);
    expect(await mailsFor(userId, again.mails)).toHaveLength(0);
  });

  it("zweite und dritte Stufe, dann nie wieder; neue Aktivität beginnt eine neue Pause", async () => {
    const { userId } = await learner(5);
    const sentAt = async (days: number) => {
      const c = collect();
      await runReactivation(new Date(noon.getTime() + days * 86_400_000), c.send);
      return (await mailsFor(userId, c.mails)).length;
    };
    expect(await sentAt(0)).toBe(1); // d5
    expect(await sentAt(7)).toBe(1); // d12
    expect(await sentAt(21)).toBe(1); // d26
    expect(await sentAt(30)).toBe(0); // Ruhe
    const rows = await getDb().select().from(reactivationMessages).where(eq(reactivationMessages.userId, userId));
    expect(rows.map((r) => r.stage).sort()).toEqual(["d12", "d26", "d5"]);
    // Neue Aktivität (Spickzettel) und wieder 5 Tage Pause: eine neue Runde beginnt
    const restart = new Date(noon.getTime() + 40 * 86_400_000);
    await getDb().insert(learningActivities).values({ userId, certificationId: (await getDb().select().from(studySessions).where(eq(studySessions.userId, userId)))[0].certificationId, kind: "cheat_sheet", createdAt: restart });
    const later = collect();
    await runReactivation(new Date(restart.getTime() + 5 * 86_400_000), later.send);
    expect(await mailsFor(userId, later.mails)).toHaveLength(1);
  });

  it("nicht bei Abmeldung, ausgeschalteter Funktion, Firmenbereich, Ruhezeit oder zu früher Pause", async () => {
    const optOut = await learner(6);
    await getDb().update(users).set({ reactivationOptOut: true }).where(eq(users.id, optOut.userId));
    const examOptOut = await learner(6);
    await getDb().update(users).set({ examRemindersOptOut: true }).where(eq(users.id, examOptOut.userId));
    const company = await learner(6);
    const [org] = await getDb().insert(organizations).values({ name: "Testfirma" }).returning();
    await getDb().insert(organizationMemberships).values({ organizationId: org.id, userId: company.userId, role: "learner" });
    const early = await learner(4);
    const flagOff = await learner(6);

    process.env.FEATURE_REACTIVATION = "0";
    const off = collect();
    await runReactivation(noon, off.send);
    expect(await mailsFor(flagOff.userId, off.mails)).toHaveLength(0);
    delete process.env.FEATURE_REACTIVATION;

    const c = collect();
    await runReactivation(noon, c.send);
    for (const who of [optOut, examOptOut, company, early]) expect(await mailsFor(who.userId, c.mails)).toHaveLength(0);

    const night = collect();
    await runReactivation(new Date("2026-10-23T03:00:00Z"), night.send);
    expect(await mailsFor(flagOff.userId, night.mails)).toHaveLength(0); // Ruhezeit
    await getDb().delete(organizations).where(eq(organizations.id, org.id));
  });

  it("schlägt der Versand fehl, wird nichts als gesendet vermerkt", async () => {
    const { userId } = await learner(5);
    await runReactivation(noon, async () => false);
    expect(await getDb().select().from(reactivationMessages).where(eq(reactivationMessages.userId, userId))).toHaveLength(0);
  });

  it("Kennzahl: Rückkehr binnen 7 Tagen nach der Mail", async () => {
    const { userId } = await learner(5);
    const c = collect();
    await runReactivation(noon, c.send);
    const [row] = await getDb().select().from(reactivationMessages).where(eq(reactivationMessages.userId, userId));
    const before = await reactivationStats(noon);
    const [session] = await getDb().select().from(studySessions).where(eq(studySessions.userId, userId));
    await getDb().insert(studySessions).values({ userId, certificationId: session.certificationId, status: "completed", goalType: "minutes", goalValue: 3, plannedAt: new Date(row.sentAt.getTime() + 86_400_000), completedAt: new Date(row.sentAt.getTime() + 86_400_000) });
    const after = await reactivationStats(new Date(noon.getTime() + 10 * 86_400_000));
    expect(after.returnedWithin7Days - before.returnedWithin7Days).toBe(1);
  });
});
