/**
 * Ausgangswerte festhalten und vergleichen (roadmap_motivation Phase 10).
 *   npm run psrp:baseline -- save "Vor dem Pilot"       Momentaufnahme der Kennzahlen speichern
 *   npm run psrp:baseline -- list                       gespeicherte Momentaufnahmen
 *   npm run psrp:baseline -- compare latest             letzte Momentaufnahme gegen jetzt
 *   npm run psrp:baseline -- compare <id-a> <id-b>      zwei Momentaufnahmen
 * Beschreibend, ohne Signifikanztests; Zeilen mit weniger als 20 im Nenner sind mit „klein“ markiert.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { saveSnapshot, listSnapshots, getSnapshot, compareSnapshots } = await import("../lib/server/psrp/baseline-db");
  const { formatFigure } = await import("../lib/server/psrp/baseline");
  const salt = process.env.PSRP_EXPORT_SALT;

  if (command === "save") {
    const row = await saveSnapshot(rest.join(" "), { salt });
    console.log(`Gespeichert: ${row.id}  „${row.label}“  (${row.basis.users} Personen, ${row.basis.reviews} Reviews)`);
    console.log("Flag-Anteile:", Object.entries(row.flagConfig).map(([k, v]) => `${k}=${v}%`).join(", "));
    return;
  }
  if (command === "list") {
    for (const row of await listSnapshots()) console.log(`${row.id}  ${row.takenAt.toISOString()}  „${row.label}“  (${row.basis.users} Personen, ${row.basis.reviews} Reviews)`);
    return;
  }
  if (command === "compare") {
    const before = await getSnapshot(rest[0] ?? "latest");
    if (!before) throw new Error("Momentaufnahme nicht gefunden (siehe „list“).");
    const after = rest[1] ? await getSnapshot(rest[1]) : undefined;
    if (rest[1] && !after) throw new Error("Zweite Momentaufnahme nicht gefunden.");
    const { rows, basisBefore, basisAfter } = await compareSnapshots(before, after ?? undefined, { salt });
    console.log(`Vorher: „${before.label}“ (${basisBefore.users} Personen, ${basisBefore.reviews} Reviews)`);
    console.log(`Nachher: ${after ? `„${after.label}“` : "jetzt"} (${basisAfter.users} Personen, ${basisAfter.reviews} Reviews)\n`);
    for (const r of rows) {
      const delta = r.delta === null ? "" : r.key.endsWith(".users") ? ` Δ ${r.delta > 0 ? "+" : ""}${r.delta}` : ` Δ ${r.delta > 0 ? "+" : ""}${(r.delta * 100).toFixed(1)} Pp`;
      console.log(`${r.key.padEnd(52)} ${formatFigure(r.key, r.before).padEnd(18)} → ${formatFigure(r.key, r.after).padEnd(18)}${delta}${r.small ? "  (klein)" : ""}`);
    }
    return;
  }
  console.error('Usage: npm run psrp:baseline -- save "<Bezeichnung>" | list | compare [<id|latest> [<id>]]');
  process.exit(1);
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
