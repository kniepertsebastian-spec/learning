/** inTransaction()/afterCommit() gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { afterCommit, getDb, inTransaction } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import { seedUser } from "@/lib/server/psrp/test-db";

const run = TEST_DB ? describe : describe.skip;

const timezoneOf = async (userId: string) => (await getDb().select({ tz: users.timezone }).from(users).where(eq(users.id, userId)))[0].tz;

run("inTransaction (echte DB)", () => {
  it("getDb() schreibt innerhalb in dieselbe Transaktion: ein Fehler rollt alles zurück", async () => {
    const userId = await seedUser("Europe/Berlin");
    await expect(
      inTransaction(async () => {
        await getDb().update(users).set({ timezone: "UTC" }).where(eq(users.id, userId));
        throw new Error("Abbruch");
      }),
    ).rejects.toThrow("Abbruch");
    expect(await timezoneOf(userId)).toBe("Europe/Berlin");
  });

  it("afterCommit läuft erst nach dem Commit, außerhalb der Transaktion; ein Fehler darin ändert das Ergebnis nicht", async () => {
    const userId = await seedUser("Europe/Berlin");
    const seen: string[] = [];
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const value = await inTransaction(async () => {
      await getDb().update(users).set({ timezone: "UTC" }).where(eq(users.id, userId));
      await afterCommit(async () => {
        seen.push(await timezoneOf(userId));
      });
      await afterCommit(() => {
        throw new Error("nachgelagert");
      });
      expect(seen).toEqual([]);
      return 42;
    });
    error.mockRestore();
    expect(value).toBe(42);
    expect(seen).toEqual(["UTC"]);
  });

  it("verschachtelt: ein zurückgerollter Savepoint verwirft seine Änderungen und vorgemerkten Schritte", async () => {
    const userId = await seedUser("Europe/Berlin");
    const seen: string[] = [];
    await inTransaction(async () => {
      await getDb().update(users).set({ timezone: "UTC" }).where(eq(users.id, userId));
      await inTransaction(async () => {
        await getDb().update(users).set({ timezone: "Asia/Tokyo" }).where(eq(users.id, userId));
        await afterCommit(() => seen.push("innen"));
        throw new Error("innen");
      }).catch(() => {});
      await afterCommit(() => seen.push("außen"));
    });
    expect(await timezoneOf(userId)).toBe("UTC");
    expect(seen).toEqual(["außen"]);
  });

  it("ohne Transaktion läuft afterCommit sofort", async () => {
    const seen: number[] = [];
    await afterCommit(() => seen.push(1));
    expect(seen).toEqual([1]);
  });
});
