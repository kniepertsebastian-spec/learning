import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications, domains, objectives, sections } from "../lib/server/db/schema";
import { generateCurriculumDraftForDomain } from "../lib/server/ai/service";

/**
 * Erzeugt einen KI-Entwurf von Objectives + Sections für jede Domain, die noch
 * keine hat (roadmap2.md Dev-Order Schritt 3-5, ausgewählter Weg: AI-Entwurf
 * statt offizieller Objectives - siehe Tracker-Notiz zu Schritt 1). Idempotent:
 * Domains, die bereits Objectives haben, werden übersprungen.
 *
 * Zertifikat wird per CLI-Argument gewählt (Default: security-plus-sy0-701,
 * damit bestehende Aufrufe ohne Argument weiterlaufen).
 *
 * Usage: npm run content:draft-curriculum -- <cert-slug>
 */
async function main() {
  const db = getDb();
  const certSlug = process.argv[2] || "security-plus-sy0-701";

  const [cert] = await db
    .select()
    .from(certifications)
    .where(eq(certifications.slug, certSlug))
    .limit(1);
  if (!cert) {
    console.error(`Zertifikat "${certSlug}" nicht gefunden. Erst \`npm run db:seed\` oder \`npm run cert:add\` ausführen.`);
    process.exit(1);
  }

  const certDomains = await db
    .select()
    .from(domains)
    .where(eq(domains.certificationId, cert.id))
    .orderBy(domains.orderNum);

  for (const domain of certDomains) {
    const existing = await db
      .select({ id: objectives.id })
      .from(objectives)
      .where(eq(objectives.domainId, domain.id))
      .limit(1);
    if (existing.length > 0) {
      console.log(`Domain ${domain.orderNum} "${domain.name}": hat bereits Objectives, überspringe.`);
      continue;
    }

    console.log(`Domain ${domain.orderNum} "${domain.name}": generiere Entwurf ...`);
    const draftObjectives = await generateCurriculumDraftForDomain(
      cert.name,
      cert.examVersion,
      domain.orderNum,
      domain.name,
    );

    await db.transaction(async (tx) => {
      for (const draft of draftObjectives) {
        const [objective] = await tx
          .insert(objectives)
          .values({
            domainId: domain.id,
            code: draft.code,
            title: draft.title,
            description: draft.description,
          })
          .returning();

        await tx.insert(sections).values(
          draft.sections.map((section, index) => ({
            objectiveId: objective.id,
            orderNum: index + 1,
            title: section.title,
            estimatedMinutes: section.estimatedMinutes,
            difficulty: section.difficulty,
          })),
        );
      }
    });

    const sectionCount = draftObjectives.reduce((sum, o) => sum + o.sections.length, 0);
    console.log(
      `Domain ${domain.orderNum} "${domain.name}": ${draftObjectives.length} Objectives, ${sectionCount} Sections gespeichert.`,
    );
  }

  console.log("Fertig. Hinweis: Objectives sind KI-Entwürfe, nicht offiziell verifiziert (siehe roadmap2.md).");
  process.exit(0);
}

main().catch((err) => {
  console.error("Curriculum-Entwurf fehlgeschlagen:", err);
  process.exit(1);
});
