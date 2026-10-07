import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

import { runMandatoryMaintenance } from "../lib/server/company/mandatory";

/**
 * Täglicher Lauf der Pflichtschulungen (docs/PFLICHTSCHULUNGEN.md): Erinnerung vor der Frist, „überfällig“ an die
 * Person, Eskalation an Mentor und Firmen-Admin. Je Zuweisung und Art geht höchstens eine Mail raus, der Lauf ist
 * also beliebig oft wiederholbar. Ohne eingerichteten Mailversand passiert nichts (Exit 0, Hinweis).
 *
 * Beginnt außerdem die neue Runde bei Pflichtschulungen mit Wiederholung (unabhängig vom Mailversand).
 *
 * Usage: npm run mandatory:run
 */
runMandatoryMaintenance()
  .then((r) => {
    console.log(`Neue Runden (Wiederholung): ${r.repeats}`);
    if (r.skippedNoMail) console.log("Mailversand nicht eingerichtet (MAIL_* und APP_BASE_URL): nichts verschickt.");
    else console.log(`Erinnerungen: ${r.reminders}, überfällig gemeldet: ${r.overdue}, eskaliert: ${r.escalations}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Lauf fehlgeschlagen:", err);
    process.exit(1);
  });
