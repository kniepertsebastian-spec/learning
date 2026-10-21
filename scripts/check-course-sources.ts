import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { and, eq, like } from "drizzle-orm";
import { CoverageRefreshError, refreshCoverage } from "../lib/server/course-editor/report";
import { getDb } from "../lib/server/db/client";
import { certifications } from "../lib/server/db/schema";

/**
 * Versionsüberwachung (roadmap3.md): ruft die Quellen der Kurse erneut ab und meldet, wo sich der Prüfungsleitfaden seit
 * der Kurserstellung geändert hat (neue Prüfungsversion, neue oder entfallene Lernziele). Ohne KI, nur Abruf. Gedacht
 * für einen regelmäßigen Lauf (z. B. wöchentlich per Cron); Exit-Code 2, wenn sich etwas geändert hat.
 *
 * Usage: npm run courses:check-sources -- <slug|--all>
 */
async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npm run courses:check-sources -- <slug|--all>");
    process.exit(1);
  }
  const courses = await getDb()
    .select({ id: certifications.id, slug: certifications.slug })
    .from(certifications)
    .where(and(eq(certifications.kind, "general"), arg === "--all" ? like(certifications.slug, "%") : eq(certifications.slug, arg)));
  let changed = 0;
  let failed = 0;
  for (const c of courses) {
    try {
      const change = await refreshCoverage(c.id);
      if (!change) {
        console.log(`✓ ${c.slug}: unverändert`);
        continue;
      }
      changed++;
      const parts = [
        change.versionsNow.length && change.versionsBefore.join() !== change.versionsNow.join() ? `Version ${change.versionsBefore.join(", ") || "?"} → ${change.versionsNow.join(", ")}` : null,
        change.added.length ? `neu: ${change.added.map((o) => o.code).join(", ")}` : null,
        change.removed.length ? `entfallen: ${change.removed.map((o) => o.code).join(", ")}` : null,
        change.textChanged && !change.added.length && !change.removed.length ? "Text geändert" : null,
      ].filter(Boolean);
      console.log(`! ${c.slug}: Quelle geändert (${parts.join("; ")}). Details im Qualitätsbericht der Werkstatt.`);
    } catch (error) {
      if (error instanceof CoverageRefreshError) {
        console.log(`– ${c.slug}: ${error.message}`);
        continue;
      }
      failed++;
      console.error(`✗ ${c.slug}: ${error instanceof Error ? error.message : error}`);
    }
  }
  process.exit(failed ? 1 : changed ? 2 : 0);
}

void main();
