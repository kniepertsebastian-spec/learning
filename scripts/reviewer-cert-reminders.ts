import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { runCertificateReminders } from "../lib/server/reviewers/profile-service";
import { isMailConfigured } from "../lib/server/mail/config";

/** Erinnerungen an ablaufende Zertifikate im Expertenprofil (60 Tage vorher; täglich per Cron). Usage: npm run reviewers:remind */
async function main() {
  if (!isMailConfigured()) {
    console.error("E-Mail-Versand ist nicht konfiguriert (SMTP_*); keine Erinnerungen verschickt.");
    process.exit(1);
  }
  const result = await runCertificateReminders();
  console.log(`Zertifikats-Erinnerungen: ${result.sent} verschickt.`);
  process.exit(0);
}
void main();
