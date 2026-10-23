import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { runReactivation } from "../lib/server/reactivation/service";
import { isMailConfigured } from "../lib/server/mail/config";
import { sendMail } from "../lib/server/mail/mailer";

/** Reaktivierungs-Mails verschicken (täglich per Cron, tagsüber). Usage: npm run reactivation:run */
async function main() {
  if (!isMailConfigured()) {
    console.error("E-Mail-Versand ist nicht konfiguriert (MAIL_*); keine Mails verschickt.");
    process.exit(1);
  }
  const result = await runReactivation(new Date(), sendMail);
  console.log(`Reaktivierung: ${result.sent} verschickt, ${result.skipped} übersprungen (abgemeldet oder Firmenbereich).`);
  process.exit(0);
}
void main();
