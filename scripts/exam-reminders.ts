import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { runExamReminders } from "../lib/server/exams/reminders";
import { isMailConfigured } from "../lib/server/mail/config";

/** Erinnerungen des Prüfungsplaners verschicken (täglich per Cron). Usage: npm run exams:remind */
async function main() {
  if (!isMailConfigured()) {
    console.error("E-Mail-Versand ist nicht konfiguriert (SMTP_*); keine Erinnerungen verschickt.");
    process.exit(1);
  }
  const result = await runExamReminders();
  console.log(`Erinnerungen: ${result.sent} verschickt, ${result.skipped} Pläne ohne Versand (abgemeldet).`);
  process.exit(0);
}
void main();
