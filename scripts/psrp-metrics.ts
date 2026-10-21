/** PSRP-HR Phase 5: anonymisierter Metrik-Export je Evaluationsgruppe als JSON. npm run psrp:metrics [-- --as-of 2026-06-01] */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { exportMetrics } = await import("../lib/server/psrp/metrics");
  const i = process.argv.indexOf("--as-of");
  const asOf = i > 0 ? new Date(process.argv[i + 1]) : undefined;
  console.log(JSON.stringify(await exportMetrics({ asOf, salt: process.env.PSRP_EXPORT_SALT }), null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
