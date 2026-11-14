import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { releaseStaleClaims } from "../lib/server/sync/reprocess";
import { STALE_CLAIM_MS } from "../lib/server/sync/service";

/**
 * Einmaliger Lauf nach Aufgabe 02a/02b (Review 12.11.2026): gibt verwaiste Sync-Claims frei, also Zeilen in `sync_events`
 * mit „wird verarbeitet“, die älter als die Schwelle aus 02a sind (`STALE_CLAIM_MS`, 5 Minuten). Das Gerät sendet das
 * Ereignis beim nächsten Sync erneut, der Server verbucht es dann. Idempotent.
 *
 * Standard ist der Trockenlauf: zeigt Anzahl und Konten und ändert nichts. Geändert wird nur mit --execute.
 *
 * Usage: npm run sync:release-stale-claims            (Trockenlauf)
 *        npm run sync:release-stale-claims -- --execute
 */
async function main() {
  const execute = process.argv.includes("--execute");
  const result = await releaseStaleClaims({ dryRun: !execute });
  console.log(`${result.stale} verwaiste(r) Claim(s) (älter als ${STALE_CLAIM_MS / 60_000} Minuten) bei ${result.byUser.length} Person(en).`);
  for (const { userId, count } of result.byUser) console.log(`  ${userId}: ${count}`);
  if (!execute) console.log("Trockenlauf: nichts geändert. Zum Freigeben mit --execute starten.");
  else console.log(`${result.released} Eintrag/Einträge freigegeben. Die Geräte senden sie beim nächsten Sync erneut.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
