import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { and, eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications } from "../lib/server/db/schema";
import { ensureLegacyApproval } from "../lib/server/approvals/service";

/** Übernimmt frühere Freigaben (Name und Datum am Kurs) als Eintrag in course_approvals. Idempotent. Usage: npm run approvals:backfill */
async function main() {
  const rows = await getDb()
    .select({ id: certifications.id, slug: certifications.slug })
    .from(certifications)
    .where(and(eq(certifications.kind, "general"), eq(certifications.catalogStatus, "approved")));
  let created = 0;
  for (const row of rows) {
    if (await ensureLegacyApproval(row.id)) {
      created++;
      console.log(`übernommen: ${row.slug}`);
    }
  }
  console.log(`${created} von ${rows.length} freigegebenen Kursen übernommen.`);
  process.exit(0);
}
void main();
