/**
 * Wendet die Migrationen aus drizzle/ an (npm run db:migrate; im Container bei jedem Start, siehe docker-compose.yml).
 *
 * Nutzt den Migrator aus drizzle-orm statt `drizzle-kit migrate`: gleiche Tabelle (drizzle.__drizzle_migrations), gleiche
 * Reihenfolge, aber ohne das Entwicklungswerkzeug drizzle-kit im Produktions-Image (PWA-Roadmap AP-04, m-5). Neue
 * Migrationen entstehen weiter mit `npm run db:generate` (drizzle-kit, nur lokal).
 * Plain JavaScript, damit es ohne tsx und ohne vorheriges Kompilieren läuft.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Wie drizzle.config.ts: lokale Einstellungen aus .env.local; im Container kommt DATABASE_URL aus docker-compose.yml.
config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ist nicht gesetzt (siehe .env.example / .env.local).");
  process.exit(1);
}

// Eine Verbindung reicht; Hinweise wie "relation already exists, skipping" aus IF NOT EXISTS sind kein Fehler.
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  console.log("Migrationen angewendet.");
} catch (error) {
  console.error("Migration fehlgeschlagen:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
