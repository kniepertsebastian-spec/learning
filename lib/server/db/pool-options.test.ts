import { afterEach, describe, expect, it } from "vitest";
import { poolOptions } from "./client";

const KEYS = ["DB_POOL_MAX", "DB_IDLE_TIMEOUT_S", "DB_STATEMENT_TIMEOUT_MS", "DB_IDLE_IN_TRANSACTION_TIMEOUT_MS"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

describe("Datenbank-Pool (R3)", () => {
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("setzt ausdrückliche Standardwerte", () => {
    for (const k of KEYS) delete process.env[k];
    expect(poolOptions()).toEqual({
      max: 10,
      idle_timeout: 60,
      connect_timeout: 10,
      connection: { statement_timeout: 60_000, idle_in_transaction_session_timeout: 60_000 },
    });
  });

  it("Werte aus der Umgebung; 0 schaltet die Zeitlimits ab, Unsinn fällt auf den Standard zurück", () => {
    process.env.DB_POOL_MAX = "20";
    process.env.DB_STATEMENT_TIMEOUT_MS = "0";
    process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS = "abc";
    expect(poolOptions()).toMatchObject({ max: 20, connection: { idle_in_transaction_session_timeout: 60_000 } });
    expect(poolOptions().connection).not.toHaveProperty("statement_timeout");
  });
});
