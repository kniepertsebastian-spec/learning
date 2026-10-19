import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { backfillSimulations, createSimulationGenerator } from "../lib/server/lessons/simulations-backfill";
import { certificationIdBySlug } from "../lib/server/questions/rationales";

/**
 * Interaktive Simulationen (Terminal, Entscheidung, Konfiguration) in bestehende Lektionen eines ALLGEMEINEN Lernpfads
 * ergänzen, wo sich das Thema dafür eignet; der Text bleibt. Interne Lernpfade einer Firma fasst das Skript nicht an.
 * Zeigt die geschätzten Kosten.
 *
 * Usage: npm run lessons:simulations -- <slug-des-lernpfads> [maximal-Lektionen]
 */
async function main() {
  const [, , slug, limitArg] = process.argv;
  if (!slug) {
    console.error("Usage: npm run lessons:simulations -- <slug> [maximal-Lektionen]");
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
  const usage = { prompt: 0, completion: 0 };
  console.log(`Ergänze Simulationen für "${cert.name}" …`);
  const result = await backfillSimulations(
    cert.id,
    createSimulationGenerator(undefined, (u) => {
      usage.prompt += u.promptTokens;
      usage.completion += u.completionTokens;
    }),
    {
      limit: limitArg ? Number(limitArg) : undefined,
      usage,
      onProgress: (c) => console.log(`  ergänzt ${c.added}, ungeeignet ${c.unsuitable}, abgelehnt/fehlgeschlagen ${c.failed}${c.costUsd !== null ? `, ca. $${c.costUsd.toFixed(4)}` : ""}`),
    },
  );
  console.log(
    `Fertig: ${result.added} Simulationen ergänzt, ${result.unsuitable} Lektionen ungeeignet, ${result.skipped} übersprungen (haben schon eine), ${result.failed} abgelehnt/fehlgeschlagen${result.aborted ? " (abgebrochen: KI-Zugang prüfen)" : ""}.`,
  );
  process.exit(result.aborted || (result.added === 0 && result.failed > 0) ? 1 : 0);
}
void main();
