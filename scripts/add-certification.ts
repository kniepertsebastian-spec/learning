import { config } from "dotenv";
config({ path: ".env.local" });

import { CertificationManagementService } from "../lib/server/admin/certification-management";

/**
 * Adds a new certification from a predefined template (roadmap2.md Dev-Order
 * Schritt 20). Only creates the certification + domain skeleton (names +
 * weights) - matches the same "objectives come later, from an official
 * source, not from LLM memory" rule as scripts/seed.ts. After running this,
 * use content:draft-curriculum / content:draft-lessons for the new cert's
 * objectives (once real domain weights + objective text are sourced).
 *
 * Usage: npm run cert:add -- network-plus
 */
async function main() {
  const templateSlug = process.argv[2];

  if (!templateSlug) {
    console.error("Usage: npm run cert:add -- <template-slug>");
    console.error("Available templates:");
    for (const t of CertificationManagementService.getAvailableTemplates()) {
      console.error(`  - ${t.slug} (${t.name})`);
    }
    process.exit(1);
  }

  const template = CertificationManagementService.getAvailableTemplates().find(
    (t) => t.slug === templateSlug,
  );

  if (!template) {
    console.error(`Unknown template "${templateSlug}". Available:`);
    for (const t of CertificationManagementService.getAvailableTemplates()) {
      console.error(`  - ${t.slug} (${t.name})`);
    }
    process.exit(1);
  }

  const result = await CertificationManagementService.createCertificationWithDomains(template);

  console.log(
    `Created "${template.name}" (${result.certificationId}) with ${result.domainsCreated} domains.`,
  );
  console.log(
    `Next: source the official objectives for "${template.examName}" before generating content ` +
      `(same rule as roadmap2.md step 1 - do not let the AI invent objectives).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to add certification:", err);
  process.exit(1);
});
