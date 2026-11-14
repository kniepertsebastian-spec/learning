import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

let client: Db | null = null;

/**
 * Laufende Transaktion aus inTransaction(). Solange sie offen ist, liefert getDb() sie statt der normalen Verbindung, damit
 * auch tief verschachtelte Dienste (Wiederholungen, Lernzielstand, ...) ohne durchgereichten Parameter in derselben
 * Transaktion schreiben. `afterCommit` sammelt Schritte, die erst nach dem Commit laufen sollen.
 */
interface TransactionScope {
  db: Db;
  open: boolean;
  afterCommit: Array<() => unknown>;
}

const scopes = new AsyncLocalStorage<TransactionScope>();

function activeScope(): TransactionScope | null {
  const scope = scopes.getStore();
  return scope?.open ? scope : null;
}

function baseDb(): Db {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL ist nicht gesetzt (siehe .env.example / .env.local).");
  }
  if (!client) {
    client = drizzle(postgres(process.env.DATABASE_URL), { schema });
  }
  return client;
}

/**
 * Lazy wie getGeminiClient() (lib/gemini.ts): DATABASE_URL erst beim
 * tatsächlichen Zugriff prüfen, nicht beim Modul-Import. Sonst bricht
 * `next build` im Docker-Build ab, da `.env.local` dort bewusst nicht
 * verfügbar ist (.dockerignore) und Next.js Route-Module beim Build lädt,
 * um Seitendaten zu sammeln - auch für Routen, die zur Laufzeit dynamisch
 * sind und die DB erst bei einem echten Request brauchen.
 *
 * Innerhalb von inTransaction() kommt die laufende Transaktion zurück.
 */
export function getDb(): Db {
  return activeScope()?.db ?? baseDb();
}

/**
 * Führt `fn` in einer Transaktion aus: jeder getDb()-Aufruf darin (auch in aufgerufenen Diensten) schreibt in dieselbe
 * Transaktion, ein Fehler rollt alles zurück. Verschachtelt wird ein Savepoint daraus. Mit afterCommit() vorgemerkte Schritte
 * laufen nach dem Commit der äußersten Transaktion, außerhalb davon; ihre Fehler werden nur protokolliert, weil die
 * Transaktion dann schon gilt.
 */
export async function inTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const parent = activeScope();
  let scope: TransactionScope | null = null;
  const value = await (parent?.db ?? baseDb()).transaction(async (tx) => {
    const current: TransactionScope = { db: tx as unknown as Db, open: true, afterCommit: [] };
    scope = current;
    try {
      return await scopes.run(current, fn);
    } finally {
      current.open = false;
    }
  });
  const committed = (scope as TransactionScope | null)?.afterCommit ?? [];
  if (parent) {
    parent.afterCommit.push(...committed);
    return value;
  }
  await scopes.exit(async () => {
    for (const step of committed) {
      try {
        await step();
      } catch (error) {
        console.error("Schritt nach dem Commit fehlgeschlagen:", error);
      }
    }
  });
  return value;
}

/**
 * Schritt nach dem Commit (nachgelagert, best effort): in einer Transaktion vorgemerkt, sonst sofort ausgeführt. Für Folgen,
 * deren Fehler die eigentliche Verbuchung nicht zurückrollen dürfen (ein SQL-Fehler macht sonst die ganze Transaktion
 * unbrauchbar), und für alles, was die Transaktion nicht lange offen halten soll.
 */
export async function afterCommit(step: () => unknown): Promise<void> {
  const scope = activeScope();
  if (scope) {
    scope.afterCommit.push(step);
    return;
  }
  await step();
}
