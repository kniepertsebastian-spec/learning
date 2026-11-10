/** Registrierung: Eingabegrenzen (ohne DB) und gespeicherter Name (echte DB nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import { POST } from "./route";

const PASSWORD = "Altes-passwort-1";
let counter = 0;
// Eigene IP je Anfrage, damit das Registrierungs-Limit (5 pro Stunde und IP) keine Rolle spielt.
const post = (data: unknown) =>
  POST(
    new Request("http://x/api/register", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": `10.99.${Math.floor(counter / 250)}.${counter++ % 250}` },
      body: JSON.stringify(data),
    }),
  );

describe("Registrierung: Eingabegrenzen", () => {
  it("lehnt einen Namen über 200 Zeichen ab", async () => {
    const res = await post({ email: "lang@example.com", password: PASSWORD, name: "n".repeat(201) });
    expect(res.status).toBe(400);
    expect((await res.json()).details[0].path).toEqual(["name"]);
  });

  it("lehnt einen Namen ab, der nur aus Leerraum besteht", async () => {
    const res = await post({ email: "leer@example.com", password: PASSWORD, name: "   " });
    expect(res.status).toBe(400);
    expect((await res.json()).details[0].path).toEqual(["name"]);
  });

  it("lehnt eine E-Mail über 254 Zeichen ab", async () => {
    const res = await post({ email: `${"a".repeat(250)}@example.com`, password: PASSWORD });
    expect(res.status).toBe(400);
    expect((await res.json()).details[0].path).toEqual(["email"]);
  });
});

const run = TEST_DB ? describe : describe.skip;

run("Registrierung: Name speichern (DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const emails = [`name-ok-${tag}@test.example`, `name-200-${tag}@test.example`];
  const previous = process.env.REGISTRATION_ALLOWED_EMAILS;

  afterAll(async () => {
    if (previous === undefined) delete process.env.REGISTRATION_ALLOWED_EMAILS;
    else process.env.REGISTRATION_ALLOWED_EMAILS = previous;
    for (const email of emails) await getDb().delete(users).where(eq(users.email, email));
  });

  it("speichert den Namen ohne Leerraum an den Rändern, auch mit genau 200 Zeichen", async () => {
    process.env.REGISTRATION_ALLOWED_EMAILS = emails.join(",");

    const trimmed = await post({ email: emails[0], password: PASSWORD, name: "  Anna Beispiel  " });
    expect(trimmed.status).toBe(201);
    expect((await trimmed.json()).user.name).toBe("Anna Beispiel");

    const longest = await post({ email: emails[1], password: PASSWORD, name: `  ${"ä".repeat(200)}  ` });
    expect(longest.status).toBe(201);
    const [row] = await getDb().select({ name: users.name }).from(users).where(eq(users.email, emails[1]));
    expect(row.name).toBe("ä".repeat(200));
  });
});
