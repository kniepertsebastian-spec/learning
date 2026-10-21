import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * PSRP-HR Phase 7.1: Konzepte und Abfragevarianten für einen ALLGEMEINEN Lernpfad erzeugen (nur Lernziele ohne Konzepte).
 * Usage: npm run concepts:tag -- <slug> [maximal-Lernziele]
 */
async function main() {
  const [, , slug, limitArg] = process.argv;
  if (!slug) {
    console.error("Usage: npm run concepts:tag -- <slug> [maximal-Lernziele]");
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY fehlt.");
    process.exit(1);
  }
  const { certificationIdBySlug } = await import("../lib/server/questions/rationales");
  const { createConceptTagger, tagCourseConcepts } = await import("../lib/server/psrp/concepts");
  const cert = await certificationIdBySlug(slug);
  if (!cert) {
    console.error(`Lernpfad "${slug}" nicht gefunden.`);
    process.exit(1);
  }
  if (cert.kind !== "general") {
    console.error("Das ist ein interner Lernpfad einer Firma; das Skript fasst ihn nicht an.");
    process.exit(1);
  }
  const counts = await tagCourseConcepts(cert.id, createConceptTagger(), {
    limit: limitArg ? Number(limitArg) : undefined,
    onProgress: (c) => console.log(`  Lernziele ${c.objectives}, Konzepte ${c.concepts}, Varianten ${c.variants}, fehlgeschlagen ${c.failed}`),
  });
  console.log("Fertig:", counts);
  process.exit(counts.failed > 0 && counts.objectives === 0 ? 1 : 0);
}
void main();
