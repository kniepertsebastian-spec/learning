import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: PostgresJsDatabase<typeof schema> | null = null;

/**
 * Lazy wie getOpenAIClient() (lib/openai.ts): DATABASE_URL erst beim
 * tatsächlichen Zugriff prüfen, nicht beim Modul-Import. Sonst bricht
 * `next build` im Docker-Build ab, da `.env.local` dort bewusst nicht
 * verfügbar ist (.dockerignore) und Next.js Route-Module beim Build lädt,
 * um Seitendaten zu sammeln - auch für Routen, die zur Laufzeit dynamisch
 * sind und die DB erst bei einem echten Request brauchen.
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL ist nicht gesetzt (siehe .env.example / .env.local).");
  }
  if (!client) {
    client = drizzle(postgres(process.env.DATABASE_URL), { schema });
  }
  return client;
}
