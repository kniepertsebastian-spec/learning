/**
 * Anmeldung über das Firmenkonto (OIDC) gegen eine echte DB und einen Fake-IdP (Schlüsselpaar im Test, Abrufe über einen
 * eingespeisten Fetcher). Geprüft wird vor allem, was nicht passieren darf: falsche Signatur/Nonce/Empfänger/Aussteller, fremde
 * Domain, Übernahme eines Kontos einer anderen Firma, mehrfach nutzbares Ticket, Herabstufung des letzten Admins.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
process.env.AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
process.env.APP_URL = "https://app.test";
process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { organizationDomains, organizationMemberships, organizations, organizationSso, ssoLoginTickets, userIdentities, users } from "@/lib/server/db/schema";
import { encryptSecret } from "@/lib/server/crypto/secret-box";
import { authenticateUser } from "@/lib/server/credentials";
import type { Fetcher } from "./oidc";
import { completeSso, consumeLoginTicket, openState, passwordLoginAllowed, roleFromGroups, SsoError, startSso } from "./service";

const run = TEST_DB ? describe : describe.skip;
const ISSUER = "https://idp.test/realm";
const CLIENT = "app-client";

describe("roleFromGroups", () => {
  const mappings = { company_admin: ["Lern-Admins"], mentor: ["Lern-Mentoren", "Ausbilder"], learner: [] };
  it("höchste Rolle gewinnt, Schreibweise egal, ohne Treffer Lernende/r", () => {
    expect(roleFromGroups(["x", "lern-mentoren"], mappings)).toBe("mentor");
    expect(roleFromGroups(["Ausbilder", "Lern-Admins"], mappings)).toBe("company_admin");
    expect(roleFromGroups(["irgendwas"], mappings)).toBe("learner");
    expect(roleFromGroups([], mappings)).toBe("learner");
  });
});

run("SSO (echte DB, Fake-IdP)", () => {
  const tag = randomUUID().slice(0, 8);
  const domain = `corp-${tag}.example`;
  let orgA = "";
  let orgB = "";
  let key: Awaited<ReturnType<typeof generateKeyPair>>;
  let otherKey: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwk: Record<string, unknown>;
  let nextClaims: Record<string, unknown> = {};
  let tokenOverrides: { audience?: string; issuer?: string; nonce?: string | null; signWithOther?: boolean; expiresIn?: string } = {};
  let lastTokenRequest: URLSearchParams | null = null;
  const sentNonce = { value: "" };
  const emails: string[] = [];

  const fetcher: Fetcher = async (url, init) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (url === `${ISSUER}/.well-known/openid-configuration`) return ok({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/auth`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks` });
    if (url === `${ISSUER}/jwks`) return ok({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] });
    if (url === `${ISSUER}/token`) {
      lastTokenRequest = new URLSearchParams(init?.body ?? "");
      const signer = new SignJWT({ ...nextClaims, ...(tokenOverrides.nonce === null ? {} : { nonce: tokenOverrides.nonce ?? sentNonce.value }) })
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(tokenOverrides.issuer ?? ISSUER)
        .setAudience(tokenOverrides.audience ?? CLIENT)
        .setIssuedAt()
        .setExpirationTime(tokenOverrides.expiresIn ?? "5m");
      return ok({ id_token: await signer.sign(tokenOverrides.signWithOther ? otherKey.privateKey : key.privateKey) });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  /** Eine komplette Anmeldung: start → (IdP) → callback. */
  async function login(claims: Record<string, unknown>, email = `anna@${domain}`) {
    nextClaims = { sub: `sub-${email}`, email, name: "Anna", groups: [], ...claims };
    const { url, cookie } = await startSso(email, fetcher);
    const state = new URL(url).searchParams.get("state")!;
    sentNonce.value = new URL(url).searchParams.get("nonce")!;
    return completeSso({ code: "code-123", state, cookie }, fetcher);
  }

  beforeAll(async () => {
    key = await generateKeyPair("RS256", { extractable: true });
    otherKey = await generateKeyPair("RS256", { extractable: true });
    jwk = (await exportJWK(key.publicKey)) as Record<string, unknown>;
    const d = getDb();
    orgA = (await d.insert(organizations).values({ name: `SsoA ${tag}` }).returning())[0].id;
    orgB = (await d.insert(organizations).values({ name: `SsoB ${tag}` }).returning())[0].id;
    await d.insert(organizationDomains).values([
      { organizationId: orgA, domain, verificationToken: "t1", verifiedAt: new Date() },
      { organizationId: orgA, domain: `unverified-${tag}.example`, verificationToken: "t2" },
      { organizationId: orgB, domain: `other-${tag}.example`, verificationToken: "t3", verifiedAt: new Date() },
    ]);
    await d.insert(organizationSso).values({
      organizationId: orgA, enabled: true, issuer: ISSUER, clientId: CLIENT, clientSecretEncrypted: encryptSecret("client-secret-xyz"), groupsClaim: "groups",
      roleMappings: { company_admin: ["admins"], mentor: ["mentoren"], learner: [] },
    });
  });
  afterAll(async () => {
    const d = getDb();
    await d.delete(users).where(inArray(users.email, emails));
    await d.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  it("Start: PKCE und Zustand, Cookie ist signiert und manipulationssicher", async () => {
    const { url, cookie } = await startSso(`Anna@${domain.toUpperCase()}`, fetcher);
    const q = new URL(url).searchParams;
    expect(url.startsWith(`${ISSUER}/auth`)).toBe(true);
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("redirect_uri")).toBe("https://app.test/api/sso/callback");
    expect(q.get("client_id")).toBe(CLIENT);
    const sealed = openState(cookie)!;
    expect(sealed.state).toBe(q.get("state"));
    expect(openState(cookie.replace(/.$/, "x"))).toBeNull();
    expect(openState(cookie, Date.now() + 11 * 60_000)).toBeNull(); // abgelaufen
  });

  it("Start: nur bestätigte Domain mit eingeschaltetem SSO; unbekannte und unbestätigte Domains scheitern", async () => {
    await expect(startSso("x@unbekannt.example", fetcher)).rejects.toBeInstanceOf(SsoError);
    await expect(startSso(`x@unverified-${tag}.example`, fetcher)).rejects.toBeInstanceOf(SsoError);
    await getDb().update(organizationSso).set({ enabled: false }).where(eq(organizationSso.organizationId, orgA));
    await expect(startSso(`x@${domain}`, fetcher)).rejects.toBeInstanceOf(SsoError);
    await getDb().update(organizationSso).set({ enabled: true }).where(eq(organizationSso.organizationId, orgA));
  });

  it("Anmeldung legt Konto, Identität und Mitgliedschaft an; Rolle aus Gruppen; Geheimnis und Verifier gehen an den IdP", async () => {
    emails.push(`anna@${domain}`);
    const result = await login({ groups: ["admins"] });
    expect(result.created).toBe(true);
    expect(lastTokenRequest!.get("client_secret")).toBe("client-secret-xyz");
    expect(lastTokenRequest!.get("code_verifier")).toBeTruthy();
    const [user] = await getDb().select().from(users).where(eq(users.id, result.userId));
    expect(user.emailVerifiedAt).not.toBeNull();
    const [member] = await getDb().select().from(organizationMemberships).where(eq(organizationMemberships.userId, result.userId));
    expect(member).toMatchObject({ organizationId: orgA, role: "company_admin" });
    expect(await getDb().select().from(userIdentities).where(eq(userIdentities.userId, result.userId))).toHaveLength(1);
    // Passwort-Anmeldung mit dem Zufallspasswort ist unmöglich
    expect(await authenticateUser(`anna@${domain}`, "irgendwas")).toBeNull();
  });

  it("Ticket: genau einmal einlösbar, abgelaufenes nicht", async () => {
    emails.push(`ticket@${domain}`);
    const { ticket, userId } = await login({}, `ticket@${domain}`);
    expect(await consumeLoginTicket(ticket)).toMatchObject({ id: userId });
    expect(await consumeLoginTicket(ticket)).toBeNull();
    const { ticket: t2 } = await login({}, `ticket@${domain}`);
    await getDb().update(ssoLoginTickets).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await consumeLoginTicket(t2)).toBeNull();
    expect(await consumeLoginTicket("erfunden")).toBeNull();
  });

  it("Rolle wird bei jeder Anmeldung neu gesetzt; der letzte Firmen-Admin wird nie herabgestuft", async () => {
    emails.push(`bert@${domain}`);
    await login({ groups: ["mentoren"] }, `bert@${domain}`);
    const roleOf = async (email: string) => (await getDb().select({ role: organizationMemberships.role }).from(organizationMemberships).innerJoin(users, eq(users.id, organizationMemberships.userId)).where(eq(users.email, email)))[0].role;
    expect(await roleOf(`bert@${domain}`)).toBe("mentor");
    await login({ groups: [] }, `bert@${domain}`);
    expect(await roleOf(`bert@${domain}`)).toBe("learner");
    // anna ist (noch) der einzige Admin: ohne Gruppe bleibt sie Admin
    await login({ groups: [] }, `anna@${domain}`);
    expect(await roleOf(`anna@${domain}`)).toBe("company_admin");
    // mit einem zweiten Admin darf sie herabgestuft werden
    await login({ groups: ["admins"] }, `bert@${domain}`);
    await login({ groups: [] }, `anna@${domain}`);
    expect(await roleOf(`anna@${domain}`)).toBe("learner");
  });

  it("Sicherheit: falscher Zustand/Cookie, falsche Nonce, Empfänger, Aussteller, fremde Signatur, abgelaufenes Token", async () => {
    const email = `evil@${domain}`;
    emails.push(email);
    const begin = async () => {
      nextClaims = { sub: "sub-evil", email, groups: [] };
      const { url, cookie } = await startSso(email, fetcher);
      sentNonce.value = new URL(url).searchParams.get("nonce")!;
      return { state: new URL(url).searchParams.get("state")!, cookie };
    };
    const attempt = async (overrides: typeof tokenOverrides) => {
      tokenOverrides = overrides;
      const { state, cookie } = await begin();
      try {
        return await completeSso({ code: "c", state, cookie }, fetcher);
      } finally {
        tokenOverrides = {};
      }
    };
    const a = await begin();
    await expect(completeSso({ code: "c", state: "falsch", cookie: a.cookie }, fetcher)).rejects.toBeInstanceOf(SsoError);
    await expect(completeSso({ code: "c", state: a.state, cookie: undefined }, fetcher)).rejects.toBeInstanceOf(SsoError);
    await expect(completeSso({ code: "c", state: a.state, cookie: a.cookie.slice(0, -2) + "zz" }, fetcher)).rejects.toBeInstanceOf(SsoError);
    await expect(attempt({ nonce: "fremde-nonce" })).rejects.toBeInstanceOf(SsoError);
    await expect(attempt({ nonce: null })).rejects.toBeInstanceOf(SsoError);
    await expect(attempt({ audience: "andere-app" })).rejects.toBeInstanceOf(SsoError);
    await expect(attempt({ issuer: "https://boeser.test" })).rejects.toBeInstanceOf(SsoError);
    await expect(attempt({ signWithOther: true })).rejects.toBeInstanceOf(SsoError);
    await expect(attempt({ expiresIn: "-10m" })).rejects.toBeInstanceOf(SsoError);
    expect(await getDb().select().from(users).where(eq(users.email, email))).toHaveLength(0);
  });

  it("Sicherheit: E-Mail außerhalb der bestätigten Domain und Konto einer anderen Firma werden abgelehnt", async () => {
    await expect(login({}, `jemand@other-${tag}.example`)).rejects.toThrow(); // Domain gehört Firma B, nicht A (startSso findet Firma B ohne SSO)
    // IdP von A liefert eine Adresse fremder Domain
    nextClaims = { sub: "sub-x", email: "boese@fremd.example", groups: [] };
    const { url, cookie } = await startSso(`x@${domain}`, fetcher);
    sentNonce.value = new URL(url).searchParams.get("nonce")!;
    await expect(completeSso({ code: "c", state: new URL(url).searchParams.get("state")!, cookie }, fetcher)).rejects.toThrow(/bestätigten Domain/);
    // Konto, das schon zu Firma B gehört
    const [u] = await getDb().insert(users).values({ email: `bmember@${domain}`, passwordHash: "x", name: "B" }).returning();
    emails.push(`bmember@${domain}`);
    await getDb().insert(organizationMemberships).values({ organizationId: orgB, userId: u.id, role: "learner" });
    await expect(login({}, `bmember@${domain}`)).rejects.toThrow(/anderen Firma/);
  });

  it("Verknüpfen eines bestehenden, unbestätigten Kontos entwertet dessen Passwort und beendet Sitzungen", async () => {
    const email = `alt@${domain}`;
    emails.push(email);
    const hash = await bcrypt.hash("bekanntes-passwort", 4);
    const [u] = await getDb().insert(users).values({ email, passwordHash: hash, name: "Alt", sessionVersion: 3 }).returning();
    await login({}, email);
    const [after] = await getDb().select().from(users).where(eq(users.id, u.id));
    expect(after.passwordHash).not.toBe(hash);
    expect(after.sessionVersion).toBe(4);
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(await authenticateUser(email, "bekanntes-passwort")).toBeNull();
  });

  it("Passwort sperren: Mitglieder gesperrt, Firmen-Admins behalten den Notzugang", async () => {
    const hash = await bcrypt.hash("pw-12345678", 4);
    const mk = async (key: string, role: "learner" | "company_admin") => {
      const email = `${key}-${tag}@${domain}`;
      emails.push(email);
      const [u] = await getDb().insert(users).values({ email, passwordHash: hash, name: key, emailVerifiedAt: new Date() }).returning();
      await getDb().insert(organizationMemberships).values({ organizationId: orgA, userId: u.id, role });
      return { id: u.id, email };
    };
    const learner = await mk("lern", "learner");
    const admin = await mk("adm", "company_admin");
    expect(await authenticateUser(learner.email, "pw-12345678")).not.toBeNull();
    await getDb().update(organizationSso).set({ enforceSso: true }).where(eq(organizationSso.organizationId, orgA));
    expect(await authenticateUser(learner.email, "pw-12345678")).toBeNull();
    expect(await passwordLoginAllowed(learner.id)).toBe(false);
    expect(await authenticateUser(admin.email, "pw-12345678")).not.toBeNull();
    await getDb().update(organizationSso).set({ enabled: false }).where(eq(organizationSso.organizationId, orgA));
    expect(await authenticateUser(learner.email, "pw-12345678")).not.toBeNull(); // SSO aus: Passwort gilt wieder
    await getDb().update(organizationSso).set({ enabled: true, enforceSso: false }).where(eq(organizationSso.organizationId, orgA));
  });
});
