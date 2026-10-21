/** PSRP-HR Phase 5: schlägt Φ-Gewichte aus den Logs vor (Ausgabe, keine automatische Übernahme). npm run psrp:fit-weights */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { and, eq, isNotNull } = await import("drizzle-orm");
  const { getDb } = await import("../lib/server/db/client");
  const { reviewLog, sessionCheckins } = await import("../lib/server/db/schema");
  const { estimateWeights } = await import("../lib/server/psrp/weights");
  const { timeStress } = await import("../lib/server/psrp/state");

  const rows = await getDb()
    .select({
      hour: reviewLog.localHour, rating: reviewLog.rawRating, predictedR: reviewLog.predictedR,
      energy: sessionCheckins.energyLevel, budget: sessionCheckins.timeBudgetMin, work: sessionCheckins.hadWorkday,
    })
    .from(reviewLog)
    .innerJoin(sessionCheckins, eq(sessionCheckins.sessionId, reviewLog.sessionId))
    .where(and(isNotNull(reviewLog.predictedR), eq(sessionCheckins.imputed, false)));
  const samples = rows.map((r) => ({
    features: [(5 - r.energy) / 4, timeStress(r.budget), r.hour >= 22 || r.hour < 5 ? 0.5 : 0, r.work ? 1 : 0] as [number, number, number, number],
    predictedR: r.predictedR as number,
    success: r.rating > 1,
  }));
  console.log(JSON.stringify(estimateWeights(samples), null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
