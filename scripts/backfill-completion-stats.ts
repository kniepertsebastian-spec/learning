import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { backfillCompletions } from "../lib/server/stats/backfill";

/**
 * Anonyme Abschluss-Statistik einmalig aus vorhandenen Prüfungsversuchen und Zertifikaten nachtragen (ohne aktive
 * Lernzeit, die gab es damals noch nicht). Läuft nur, solange noch nichts nachgetragen wurde.
 *
 * Usage: npm run stats:backfill-completions
 */
async function main() {
  const result = await backfillCompletions();
  if (!result) {
    console.log("Schon nachgetragen, nichts zu tun.");
    process.exit(0);
  }
  console.log(`Nachgetragen: ${result.finalExams} bestandene Abschlussprüfungen, ${result.certificates} Zertifikate; ${result.attemptsMarked} ältere Prüfungsversuche als bestanden/nicht bestanden markiert.`);
  process.exit(0);
}
void main();
