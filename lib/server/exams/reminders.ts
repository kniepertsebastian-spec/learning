import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, examPlans, userCertificates, users } from "@/lib/server/db/schema";
import { certReminderStages } from "@/lib/certificates/logic";
import { planReminders, type PlanReminder } from "@/lib/exams/plan";
import { appUrl, isMailConfigured } from "@/lib/server/mail/config";
import { sendMail, type MailMessage } from "@/lib/server/mail/mailer";
import { certificateExpiryMessage, examReminderMessage } from "@/lib/server/mail/templates";

/** Erinnerungen des Prüfungsplaners per E-Mail. Je Plan und Art höchstens eine Mail; wer sich abgemeldet hat, bekommt keine. */
export async function runExamReminders(now: Date = new Date(), send: (m: MailMessage) => Promise<boolean> = sendMail): Promise<{ sent: number; skipped: number }> {
  const db = getDb();
  const rows = await db
    .select({ plan: examPlans, email: users.email, optOut: users.examRemindersOptOut, courseName: certifications.name })
    .from(examPlans)
    .innerJoin(users, eq(users.id, examPlans.userId))
    .innerJoin(certifications, eq(certifications.id, examPlans.certificationId))
    .where(inArray(examPlans.status, ["planned", "failed"]));
  let sent = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.optOut) {
      skipped++;
      continue;
    }
    for (const kind of planReminders(r.plan, now) as PlanReminder[]) {
      if (r.plan.remindersSent[kind]) continue;
      const when = kind === "voucher_expiring" ? r.plan.voucherExpiresAt : r.plan.scheduledAt;
      const ok = await send(examReminderMessage(r.email, { kind, courseName: r.courseName, when, link: isMailConfigured() ? appUrl("/exams") : "/exams" }));
      if (!ok) continue;
      await db.update(examPlans).set({ remindersSent: { ...r.plan.remindersSent, [kind]: now.toISOString() } }).where(and(eq(examPlans.id, r.plan.id)));
      r.plan.remindersSent[kind] = now.toISOString();
      sent++;
    }
  }

  // Eigene Zertifikate: 90 und 30 Tage vor Ablauf (einmal je Stufe)
  const certRows = await db
    .select({ cert: userCertificates, email: users.email, optOut: users.examRemindersOptOut })
    .from(userCertificates)
    .innerJoin(users, eq(users.id, userCertificates.userId));
  for (const r of certRows) {
    if (r.optOut || !r.cert.expiresAt) continue;
    for (const stage of certReminderStages(r.cert.expiresAt, r.cert.remindersSent, now)) {
      const ok = await send(certificateExpiryMessage(r.email, { title: r.cert.title, expiresAt: r.cert.expiresAt, days: stage === "d30" ? 30 : 90, link: isMailConfigured() ? appUrl("/certificates") : "/certificates" }));
      if (!ok) continue;
      await db.update(userCertificates).set({ remindersSent: { ...r.cert.remindersSent, [stage]: now.toISOString() } }).where(eq(userCertificates.id, r.cert.id));
      r.cert.remindersSent[stage] = now.toISOString();
      sent++;
    }
  }
  return { sent, skipped };
}
