import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { backfillRationales, certificationIdBySlug, createRationaleGenerator } from "../lib/server/questions/rationales";

/**
 * Begründungen „Warum die anderen nicht passen“ für bestehende Fragen eines ALLGEMEINEN Lernpfads erzeugen.
 * Interne Lernpfade einer Firma fasst das Skript bewusst nicht an.
 *
 * Usage: npm run rationales:backfill -- <slug-des-lernpfads> [maximal-Fragen]
 */
async function main() {
  const [, , slug, limitArg] = process.argv;
  if (!slug) {
    console.error("Usage: npm run rationales:backfill -- <slug> [maximal-Fragen]");
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY fehlt.");
    process.exit(1);
  }
  const cert = await certificationIdBySlug(slug);
  if (!cert) {
    console.error(`Lernpfad "${slug}" nicht gefunden.`);
    process.exit(1);
  }
  if (cert.kind !== "general") {
    console.error("Das ist ein interner Lernpfad einer Firma; das Skript fasst ihn nicht an.");
    process.exit(1);
  }
  console.log(`Erzeuge Begründungen für "${cert.name}" …`);
  const result = await backfillRationales(cert.id, createRationaleGenerator(), {
    limit: limitArg ? Number(limitArg) : undefined,
    onProgress: (c) => console.log(`  erzeugt ${c.created}, fehlgeschlagen ${c.failed}`),
  });
  console.log(`Fertig: ${result.created} Fragen ergänzt, ${result.failed} fehlgeschlagen${result.aborted ? " (abgebrochen: KI-Zugang prüfen)" : ""}.`);
  process.exit(result.aborted || result.created === 0 ? 1 : 0);
}
void main();
