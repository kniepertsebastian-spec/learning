import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { and, eq, like } from "drizzle-orm";
import { backfillPossible } from "../lib/server/course-editor/possible-backfill";
import { translateCourse } from "../lib/server/course-translation/service";
import { getDb } from "../lib/server/db/client";
import { certifications } from "../lib/server/db/schema";

/**
 * Bestehende Lektionen um „Was damit möglich ist“ (`> [!POSSIBLE]`) und die Textverweise der Simulationen (`review`)
 * ergänzen (roadmap3.md). Nur allgemeine Kurse; vorher wird der Kurs automatisch gemerkt, jede Änderung steht mit
 * Herkunft „KI“ in den Versionen. Bei übersetzten Kursen wird danach die zweite Sprache neu übersetzt.
 *
 * Usage: npm run lessons:possible -- <slug|--all> [--dry-run] [--limit N]
 */
async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
  const all = args.includes("--all");
  const dryRun = args.includes("--dry-run");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;
  if (!target && !all) {
    console.error("Usage: npm run lessons:possible -- <slug|--all> [--dry-run] [--limit N]");
    process.exit(1);
  }
  if (!dryRun && !process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY fehlt.");
    process.exit(1);
  }
  const courses = await getDb()
    .select({ id: certifications.id, slug: certifications.slug, translatedAt: certifications.translatedAt })
    .from(certifications)
    .where(and(eq(certifications.kind, "general"), all ? like(certifications.slug, "%") : eq(certifications.slug, target!)));
  if (courses.length === 0) console.log("Kein passender allgemeiner Kurs gefunden.");
  let failed = 0;
  let cost = 0;
  for (const c of courses) {
    console.log(`${c.slug}:`);
    const r = await backfillPossible(c.id, { dryRun, limit, log: console.log });
    cost += r.costUsd;
    failed += r.failed;
    console.log(dryRun ? `  ${r.checked} Lektionen brauchen einen Nachtrag (nichts geändert).` : `  ${r.updated} ergänzt, ${r.skipped} übersprungen, ${r.failed} fehlgeschlagen.`);
    if (!dryRun && r.updated > 0 && c.translatedAt) {
      const t = await translateCourse(c.id).catch((e) => (console.error(`  Übersetzung fehlgeschlagen: ${e instanceof Error ? e.message : e}`), null));
      if (t) console.log(`  Übersetzung: ${t.done} Teile neu übersetzt${t.failed ? `, ${t.failed} fehlgeschlagen` : ""}.`);
    }
  }
  if (!dryRun) console.log(`Geschätzte Kosten: ${cost.toFixed(4)} USD`);
  process.exit(failed ? 1 : 0);
}

void main();
