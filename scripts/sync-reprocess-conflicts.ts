import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { releaseConflictEvents } from "../lib/server/sync/reprocess";

/**
 * Einmaliger Lauf nach Datenintegrität Phase 3 (roadmap_datenintegritaet.md): gibt alte Sync-Konflikte frei, damit die Geräte
 * sie erneut senden können. Idempotent. Erst mit --dry-run ansehen, dann ohne ausführen.
 *
 * Usage: npm run sync:reprocess-conflicts -- [--dry-run]
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const result = await releaseConflictEvents({ dryRun });
  console.log(`${result.conflicts} Konflikt-Ereignis(se) bei ${result.byUser.length} Person(en).`);
  if (dryRun) console.log("Trockenlauf: nichts geändert.");
  else console.log(`${result.released} Eintrag/Einträge freigegeben. Die Geräte senden sie beim nächsten Sync erneut.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
