import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * Voraussetzungen zwischen den Konzepten eines ALLGEMEINEN Lernpfads (Didaktik Phase 9.3) per KI als Entwurf vorschlagen. Ohne --yes
 * wird nur die Kostenschätzung gezeigt. Wirksam wird erst, was ein Admin in der Werkstatt freigibt. Interne Lernpfade einer Firma
 * fasst das Skript nicht an.
 *
 * Usage: npm run prerequisites:backfill -- <slug> [--yes]
 */
async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--"));
  const confirmed = args.includes("--yes");
  if (!slug) {
    console.error("Usage: npm run prerequisites:backfill -- <slug> [--yes]");
    process.exit(1);
  }
  const { certificationIdBySlug } = await import("../lib/server/questions/rationales");
  const { backfillPrerequisites, createPrerequisiteGenerator, estimateRun, loadCourseConcepts } = await import("../lib/server/prerequisites/generate");
  const cert = await certificationIdBySlug(slug);
  if (!cert) {
    console.error(`Lernpfad "${slug}" nicht gefunden.`);
    process.exit(1);
  }
  if (cert.kind !== "general") {
    console.error("Das ist ein interner Lernpfad einer Firma; das Skript fasst ihn nicht an.");
    process.exit(1);
  }
  const conceptCount = (await loadCourseConcepts(cert.id)).length;
  const estimate = estimateRun(conceptCount);
  console.log(`"${cert.name}": ${estimate.concepts} Konzepte, ${estimate.requests} KI-Anfragen.`);
  console.log(
    estimate.costUsd === null
      ? "Kostenschätzung: nicht berechenbar (für das Modell sind keine Preise hinterlegt, siehe GEMINI_*_PRICE)."
      : `Kostenschätzung: ca. ${estimate.costUsd.toFixed(2)} USD (~${estimate.promptTokens} Prompt-, ~${estimate.completionTokens} Ausgabe-Token, grobe Näherung).`,
  );
  if (!confirmed) {
    console.log("Nichts erzeugt. Mit --yes ausführen.");
    process.exit(0);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY fehlt.");
    process.exit(1);
  }
  const result = await backfillPrerequisites(cert.id, createPrerequisiteGenerator(), {
    onProgress: (c) => console.log(`  Vorschläge ${c.created}, verworfen ${c.rejected}, fehlgeschlagen ${c.failed}`),
  });
  console.log(`Fertig: ${result.created} Vorschläge (zur Freigabe in der Werkstatt), ${result.rejected} verworfen, ${result.failed} Anfragen fehlgeschlagen${result.aborted ? " (abgebrochen: KI-Zugang prüfen)" : ""}.`);
  process.exit(result.aborted ? 1 : 0);
}
void main();
