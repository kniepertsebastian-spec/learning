import { config } from "dotenv";
config({ path: ".env.local" });

import { coursePackageV1Schema } from "../lib/server/course-generation/schemas";
import { buildSampleCoursePackage } from "../lib/server/course-generation/fixtures";
import { importCoursePackage } from "../lib/server/course-generation/importer";

/**
 * Phase 1 (course_generation.md, Abschnitt 16 + 19): "Einen Kurs vollständig
 * aus einer manuell erstellten Fixture importieren" - der konkrete manuelle
 * Test für den transaktionalen Importer, bevor Phase 2+ ihn automatisch
 * aufruft. Idempotenzschutz: ein zufälliger Slug-Seed pro Lauf, damit
 * wiederholte Aufrufe nicht am Unique-Constraint von `certifications.slug`
 * scheitern.
 *
 * Usage: npm run course:import-fixture -- <slug-seed>
 */
async function main() {
  const slugSeed = process.argv[2] || Math.random().toString(36).slice(2, 8);
  const pkg = buildSampleCoursePackage(slugSeed);

  const validation = coursePackageV1Schema.safeParse(pkg);
  if (!validation.success) {
    console.error("Fixture verletzt coursePackageV1Schema:", validation.error.message);
    process.exit(1);
  }

  const result = await importCoursePackage(validation.data);
  console.log(
    `Importiert: ${result.slug} (certificationId=${result.certificationId}, ` +
      `${result.domainCount} Domain(s), ${result.objectiveCount} Objective(s), ` +
      `${result.sectionCount} Section(s), ${result.questionCount} Frage(n)).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Fixture-Import fehlgeschlagen:", err);
  process.exit(1);
});
