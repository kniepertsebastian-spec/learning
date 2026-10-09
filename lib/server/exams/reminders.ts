import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, examPlans, users } from "@/lib/server/db/schema";
import { planReminders, type PlanReminder } from "@/lib/exams/plan";
import { appUrl, isMailConfigured } from "@/lib/server/mail/config";
import { sendMail, type MailMessage } from "@/lib/server/mail/mailer";
import { examReminderMessage } from "@/lib/server/mail/templates";

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
  return { sent, skipped };
}
