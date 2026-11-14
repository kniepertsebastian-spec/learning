import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { auditExamAttempts, type Range } from "../lib/server/exam/attempt-audit";

/**
 * Aufgabe 05b (docs/roadmaps/review-2026-11-12/05b-pruefung-bestehende-versuche.md): bestandene Prüfungsversuche aus der Zeit
 * vor der serverseitigen Prüfung nachrechnen. Liest nur, ändert nichts. Gibt nur Anzahlen und Zeiträume aus, keine Personen.
 *
 * Usage: npm run exams:audit-attempts
 */
const span = (r: Range) => (r.count === 0 ? "0" : `${r.count} (${r.from} bis ${r.to})`);

async function main() {
  const report = await auditExamAttempts();
  console.log(`Als bestanden geltende Prüfungsversuche: ${report.passedAttempts}`);
  console.log(`  mit weniger gültigen Antworten als Prüfungsfragen: ${span(report.incomplete)}`);
  console.log(`  nachgerechnet unter der Bestehensgrenze (verdächtig): ${span(report.suspicious)}`);
  console.log(`  ohne gespeicherte Antworten (nicht nachrechenbar): ${span(report.unverifiable)}`);
  console.log(`Personen mit verdächtigem Versuch: ${report.people}`);
  console.log(`Wahrscheinlich betroffene Zeilen der Abschlussstatistik: ${span(report.completionEvents)}`);
  console.log(`Wahrscheinlich betroffene Kurs-Skills: ${report.courseSkills}`);
  console.log("Nur gelesen, nichts geändert.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
