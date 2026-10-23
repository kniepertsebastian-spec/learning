import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * Alternativerklärungen für den Verstehens-Modus (Didaktik Phase 9.2) für einen ALLGEMEINEN Lernpfad vorab per KI als Entwurf
 * erzeugen. Ohne --yes wird nur die Kostenschätzung gezeigt. Die Entwürfe sieht erst ein Admin in der Werkstatt; Lernende sehen
 * nur Freigegebenes. Interne Lernpfade einer Firma fasst das Skript nicht an.
 *
 * Usage: npm run explanations:backfill -- <slug> [--limit N] [--yes]
 */
async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
  const confirmed = args.includes("--yes");
  if (!slug || (limit !== undefined && !(limit > 0))) {
    console.error("Usage: npm run explanations:backfill -- <slug> [--limit N] [--yes]");
    process.exit(1);
  }
  const { certificationIdBySlug } = await import("../lib/server/questions/rationales");
  const { backfillExplanations, createExplanationGenerator, estimateRun, loadExplanationSources, missingKinds } = await import("../lib/server/explanations/generate");
  const cert = await certificationIdBySlug(slug);
  if (!cert) {
    console.error(`Lernpfad "${slug}" nicht gefunden.`);
    process.exit(1);
  }
  if (cert.kind !== "general") {
    console.error("Das ist ein interner Lernpfad einer Firma; das Skript fasst ihn nicht an.");
    process.exit(1);
  }

  const sources = (await loadExplanationSources(cert.id)).filter((s) => missingKinds(s.existingKinds).length > 0).slice(0, limit ?? Infinity);
  const estimate = estimateRun(sources);
  console.log(`"${cert.name}": ${estimate.objectives} Lernziele ohne Alternativerklärungen, ${estimate.explanations} Entwürfe zu erzeugen.`);
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
  const result = await backfillExplanations(cert.id, createExplanationGenerator(), {
    limit,
    onProgress: (c) => console.log(`  Lernziele ${c.objectives}, Entwürfe ${c.created}, verworfen ${c.rejected}, fehlgeschlagen ${c.failed}`),
  });
  console.log(`Fertig: ${result.created} Entwürfe für ${result.objectives} Lernziele (zur Freigabe in der Werkstatt), ${result.rejected} verworfen, ${result.failed} fehlgeschlagen${result.aborted ? " (abgebrochen: KI-Zugang prüfen)" : ""}.`);
  process.exit(result.aborted || (result.created === 0 && estimate.explanations > 0) ? 1 : 0);
}
void main();
