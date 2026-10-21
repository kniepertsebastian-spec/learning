/** PSRP-HR Phase 5: Offline-Simulator (365 Tage) für mehrere r_ziel-Werte. npm run psrp:simulate -- 0.75 0.8 0.85 0.9 */
import { compareTargets } from "../lib/server/psrp/simulator";

const targets = process.argv.slice(2).map(Number).filter((n) => n > 0 && n < 1);
const result = compareTargets(targets.length ? targets : [0.75, 0.8, 0.85, 0.9], {
  newCardsPerDay: 10, totalCards: 1000, timeBudgetMin: 20, secondsPerReview: 15, seed: 1,
});
console.table(result.map((r) => ({
  r_ziel: r.rTarget, "Reviews/Tag Ø": r.meanReviewsPerDay.toFixed(1), "Reviews/Tag max": r.maxReviewsPerDay,
  "Behaltensquote": r.retention.toFixed(3), Rückstau: r.finalBacklog, "Karten gelernt": r.cardsLearned,
})));
