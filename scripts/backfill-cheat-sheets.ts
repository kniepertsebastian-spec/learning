import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications } from "../lib/server/db/schema";
import { backfillLessons, createCheatSheetGenerator } from "../lib/server/internal-courses/cheat-sheets";

/**
 * Merkzettel für ALLGEMEINE Lernpfade nachträglich erzeugen (Lektionen ohne Merkzettel), mit dem KI-Zugang der Plattform.
 * Interne Lernpfade einer Firma fasst das Skript bewusst nicht an: die Firma löst das selbst im Firmenbereich aus, damit
 * der Betreiber keine Firmeninhalte liest oder an die KI schickt.
 *
 * Usage: npm run cheatsheets:backfill -- <slug-des-lernpfads> [maximal-Lektionen]
 */
async function main() {
  const [, , slug, limitArg] = process.argv;
  if (!slug) {
    console.error("Usage: npm run cheatsheets:backfill -- <slug> [maximal-Lektionen]");
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY fehlt.");
    process.exit(1);
  }
  const [cert] = await getDb().select({ id: certifications.id, kind: certifications.kind, name: certifications.name }).from(certifications).where(eq(certifications.slug, slug)).limit(1);
  if (!cert) {
    console.error(`Lernpfad "${slug}" nicht gefunden.`);
    process.exit(1);
  }
  if (cert.kind !== "general") {
    console.error("Das ist ein interner Lernpfad einer Firma. Die Firma erzeugt die Merkzettel selbst im Firmenbereich.");
    process.exit(1);
  }
  const limit = limitArg ? Number(limitArg) : undefined;
  console.log(`Erzeuge Merkzettel für "${cert.name}" …`);
  const result = await backfillLessons(cert.id, createCheatSheetGenerator(), {
    limit,
    onProgress: (c) => console.log(`  erzeugt ${c.created}, verworfen (Scanner) ${c.skipped}, fehlgeschlagen ${c.failed}`),
  });
  console.log(`Fertig: ${result.created} erzeugt, ${result.skipped} verworfen, ${result.failed} fehlgeschlagen${result.aborted ? " (abgebrochen: KI-Zugang prüfen)" : ""}.`);
  process.exit(result.aborted || result.created === 0 ? 1 : 0);
}
void main();
