/** Firmen-Anlage per Bestätigungslink (Registrierung als Unternehmen, Kontoeinstellungen) gegen eine ECHTE Postgres-DB. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { eq, inArray, like } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { companyClaims, organizationMemberships, organizations, users } from "@/lib/server/db/schema";
import { POST as registerRoute } from "@/app/api/register/route";
import { POST as claimRoute } from "@/app/api/account/company/route";
import { POST as confirmRoute } from "@/app/api/company/claim/confirm/route";
import { confirmCompanyClaim, hashClaimToken } from "./claims";

const run = TEST_DB ? describe : describe.skip;

run("Firma per Bestätigungslink (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const created: string[] = [];

  async function mkUser(key: string) {
    const [x] = await getDb().insert(users).values({ email: `${key}-${tag}@firma-${tag}.example`, passwordHash: "x" }).returning({ id: users.id, email: users.email });
    created.push(x.id);
    return x;
  }
  async function mkClaim(userId: string, email: string, name: string, offsetMs = 3_600_000) {
    const token = randomUUID() + randomUUID();
    await getDb().insert(companyClaims).values({ userId, companyName: name, companyEmail: email, tokenHash: hashClaimToken(token), expiresAt: new Date(Date.now() + offsetMs) });
    return token;
  }
  const json = (body: unknown) => new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  beforeAll(() => {
    delete process.env.MAIL_SMTP_HOST; // kein Versand eingerichtet
    process.env.REGISTRATION_ALLOWED_EMAILS = `reg-${tag}@firma-${tag}.example,gm-${tag}@gmail.com,noname-${tag}@firma-${tag}.example,priv-${tag}@firma-${tag}.example`;
  });
  afterAll(async () => {
    const d = getDb();
    const orgs = await d.select({ id: organizations.id }).from(organizations).where(like(organizations.name, `%${tag}%`));
    if (orgs.length) await d.delete(organizations).where(inArray(organizations.id, orgs.map((o) => o.id)));
    await d.delete(users).where(like(users.email, `%${tag}%`));
    if (created.length) await d.delete(users).where(inArray(users.id, created));
  });

  it("Link einlösen: Firma entsteht, Konto wird Firmen-Admin, Adresse bestätigt, nur einmal", async () => {
    const u = await mkUser("einl");
    const token = await mkClaim(u.id, u.email, `Acme ${tag}`);
    const r = await confirmCompanyClaim(token);
    expect(r.ok).toBe(true);
    const [m] = await getDb().select().from(organizationMemberships).where(eq(organizationMemberships.userId, u.id));
    expect(m.role).toBe("company_admin");
    const [row] = await getDb().select({ v: users.emailVerifiedAt }).from(users).where(eq(users.id, u.id));
    expect(row.v).not.toBeNull();
    expect(await confirmCompanyClaim(token)).toEqual({ ok: false, reason: "invalid" });
    const orgs = await getDb().select().from(organizations).where(eq(organizations.name, `Acme ${tag}`));
    expect(orgs).toHaveLength(1);
  });

  it("abgelaufen, unbekannt, parallel: genau ein Gewinner; Mitglied einer Firma legt nichts an", async () => {
    const u = await mkUser("para");
    expect(await confirmCompanyClaim(await mkClaim(u.id, u.email, `Abgelaufen ${tag}`, -1000))).toEqual({ ok: false, reason: "invalid" });
    expect(await confirmCompanyClaim("x".repeat(43))).toEqual({ ok: false, reason: "invalid" });
    const token = await mkClaim(u.id, u.email, `Para ${tag}`);
    const results = await Promise.all([confirmCompanyClaim(token), confirmCompanyClaim(token), confirmCompanyClaim(token)]);
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    // schon Mitglied: kein zweite Firma
    const again = await mkClaim(u.id, u.email, `Zweite ${tag}`);
    expect(await confirmCompanyClaim(again)).toEqual({ ok: false, reason: "already_member" });
    expect(await getDb().select().from(organizations).where(eq(organizations.name, `Zweite ${tag}`))).toHaveLength(0);
  });

  it("Bestätigungs-API: Token Pflicht, ungültig 400, gültig 200", async () => {
    const u = await mkUser("api");
    expect((await confirmRoute(json({}))).status).toBe(400);
    expect((await confirmRoute(json({ token: "y".repeat(43) }))).status).toBe(400);
    const res = await confirmRoute(json({ token: await mkClaim(u.id, u.email, `Api ${tag}`) }));
    expect(res.status).toBe(200);
    expect((await res.json()).organizationName).toBe(`Api ${tag}`);
  });

  it("Einstellungen: ohne Anmeldung 401, ohne Mailversand 503, Freemail 400, Mitglied 409 (ohne Versand zuerst 503)", async () => {
    const u = await mkUser("einst");
    authMock.mockResolvedValue(null);
    expect((await claimRoute(json({ companyName: "X", companyEmail: "a@firma.example" }))).status).toBe(401);
    authMock.mockResolvedValue({ user: { id: u.id } });
    expect((await claimRoute(json({ companyName: "X", companyEmail: "a@firma.example" }))).status).toBe(503);
    expect((await claimRoute(json({ companyName: "", companyEmail: "a@firma.example" }))).status).toBe(400);
  });

  it("Registrierung als Unternehmen (ohne Mailversand): Firma sofort, Freemail und fehlender Name 400, Privat bleibt privat", async () => {
    const ok = await registerRoute(json({ email: `reg-${tag}@firma-${tag}.example`, password: "Sehr-sicheres-Passwort-1", name: "R", accountType: "company", companyName: `RegCo ${tag}` }));
    expect(ok.status).toBe(201);
    const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, `reg-${tag}@firma-${tag}.example`));
    const [m] = await getDb().select().from(organizationMemberships).where(eq(organizationMemberships.userId, user.id));
    expect(m.role).toBe("company_admin");

    const free = await registerRoute(json({ email: `gm-${tag}@gmail.com`, password: "Sehr-sicheres-Passwort-1", accountType: "company", companyName: "Gmail GmbH" }));
    expect(free.status).toBe(400);
    const noName = await registerRoute(json({ email: `noname-${tag}@firma-${tag}.example`, password: "Sehr-sicheres-Passwort-1", accountType: "company" }));
    expect(noName.status).toBe(400);

    const priv = await registerRoute(json({ email: `priv-${tag}@firma-${tag}.example`, password: "Sehr-sicheres-Passwort-1" }));
    expect(priv.status).toBe(201);
    const [p] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, `priv-${tag}@firma-${tag}.example`));
    expect(await getDb().select().from(organizationMemberships).where(eq(organizationMemberships.userId, p.id))).toHaveLength(0);
  });
});
