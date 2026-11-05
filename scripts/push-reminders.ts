import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { isPushConfigured } from "../lib/server/push/config";
import { runPushReminders } from "../lib/server/push/service";

/** Web-Push-Erinnerungen verschicken (stündlich per Cron, Details in docs/PWA.md). Usage: npm run push:remind */
async function main() {
  if (!isPushConfigured()) {
    console.error("Web Push ist nicht eingerichtet (VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY); keine Nachrichten verschickt. Schlüssel erzeugen: npm run push:keys");
    process.exit(1);
  }
  const result = await runPushReminders();
  console.log(`Push: ${result.users} Personen mit Gerät geprüft, ${result.sent} Nachrichten zugestellt.`);
  process.exit(0);
}
void main();
