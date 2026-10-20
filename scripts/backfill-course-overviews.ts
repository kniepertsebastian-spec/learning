import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { ensureCourseOverview, listCoursesWithoutOverview, translateCourseOverview } from "../lib/server/course-overview/service";

/**
 * Kursbeschreibung (roadmap3.md, Schritt 4) für bestehende Kurse erzeugen, die noch keine haben, und in die zweite
 * Sprache übersetzen, wenn der Kurs schon übersetzt ist. Vorhandene Beschreibungen bleiben unberührt.
 *
 * Usage: npm run courses:overviews -- <slug|--all>
 */
async function main() {
  const [, , arg] = process.argv;
  if (!arg) {
    console.error("Usage: npm run courses:overviews -- <slug|--all>");
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY fehlt.");
    process.exit(1);
  }
  const courses = await listCoursesWithoutOverview(arg === "--all" ? undefined : arg);
  if (courses.length === 0) console.log("Nichts zu tun: alle gewählten Kurse haben schon eine Beschreibung (oder der Kurs existiert nicht).");
  let failed = 0;
  for (const c of courses) {
    try {
      await ensureCourseOverview(c.id);
      console.log(`✓ ${c.slug}: Beschreibung erzeugt`);
      // Übersetzt wird nur, wenn der Kurs selbst schon zweisprachig ist; sonst übernimmt das der Übersetzungslauf.
      await translateCourseOverview(c.id).catch((e) => console.log(`  (Übersetzung später: ${e instanceof Error ? e.message : e})`));
    } catch (error) {
      failed++;
      console.error(`✗ ${c.slug}: ${error instanceof Error ? error.message : error}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

void main();
