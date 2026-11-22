import { afterAll, beforeAll } from "vitest";
import postgres from "postgres";

/**
 * Das Kostenbuch (`ai_cost_entries`) ist eine einzige Tabelle für die ganze Test-Datenbank, und Vitest führt Testdateien
 * parallel aus. `ai-ledger.db.test.ts` prüft Summen über das ganze Buch (Gesamtkosten, „Ohne Kurs“, BYOK, Budget); bucht
 * eine andere Datei gleichzeitig, stimmen die Differenzen nicht mehr (CI zu PR #221: 3 × 0,75 USD zu viel).
 *
 * Jede DB-Testdatei, die ins Kostenbuch schreibt, hält deshalb für ihre ganze Laufzeit dieses Advisory-Lock. Die übrige
 * Suite läuft weiter parallel. Das Lock hängt an einer eigenen Verbindung (`max: 1`), weil Postgres es pro Sitzung vergibt.
 */
const AI_LEDGER_LOCK_KEY = 74_200_221;

/** Warten auf eine andere Datei, die das Buch gerade nutzt: großzügiger als Vitests 10 s für Hooks. */
const LOCK_TIMEOUT_MS = 180_000;

/** Im `run(...)`-Block einer DB-Testdatei aufrufen, die Kosten bucht oder Kostensummen prüft. */
export function useAiLedgerLock(databaseUrl: string | undefined): void {
  let sql: ReturnType<typeof postgres> | null = null;

  beforeAll(async () => {
    if (!databaseUrl) return;
    sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    await sql`select pg_advisory_lock(${AI_LEDGER_LOCK_KEY})`;
  }, LOCK_TIMEOUT_MS);

  // Vitest führt afterAll-Hooks in umgekehrter Reihenfolge aus: als Erstes registriert, gibt dieser das Lock erst nach dem
  // Aufräumen der Datei frei (deren gelöschte Buchungen sollen keine andere Datei mehr stören).
  afterAll(async () => {
    if (!sql) return;
    await sql`select pg_advisory_unlock(${AI_LEDGER_LOCK_KEY})`.catch(() => {});
    await sql.end({ timeout: 5 });
    sql = null;
  });
}
