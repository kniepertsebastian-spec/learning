/**
 * PSRP-HR Phase 2: fittet persönliche FSRS-Parameter für alle Nutzer mit genug Reviews.
 * Periodisch ausführen (z. B. wöchentlich): npm run fsrs:optimize
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { fitUser, usersDueForFit } = await import("../lib/server/psrp/optimizer");
  const userIds = await usersDueForFit();
  const counts: Record<string, number> = {};
  for (const userId of userIds) {
    const result = await fitUser(userId);
    counts[result] = (counts[result] ?? 0) + 1;
  }
  console.log(`Nutzer geprüft: ${userIds.length}`, counts);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
