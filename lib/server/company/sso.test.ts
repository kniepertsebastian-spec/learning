/** Einrichtung der Firmenkonto-Anmeldung (echte DB): nur Firmen-Admin, Domain-Bestätigung per DNS, Schutz vor fremden Domains, Geheimnis nie zurück. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
process.env.AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
process.env.APP_URL = "https://app.test";
process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { organizationDomains, organizationMemberships, organizations, organizationSso, users } from "@/lib/server/db/schema";
import { GET as ssoGet, PUT as ssoPut } from "@/app/api/company/sso/route";
import { POST as domainPost } from "@/app/api/company/sso/domains/route";
import { addDomain, getSsoView, removeDomain, saveSsoConfig, SsoConfigError, verifyDomain } from "./sso";
import type { Fetcher } from "@/lib/server/sso/oidc";

const run = TEST_DB ? describe : describe.skip;
const ISSUER = "https://idp.test/realm";
const fetcher: Fetcher = async (url) =>
  url === `${ISSUER}/.well-known/openid-configuration`
    ? { ok: true, status: 200, json: async () => ({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/a`, token_endpoint: `${ISSUER}/t`, jwks_uri: `${ISSUER}/j` }) }
    : { ok: false, status: 404, json: async () => ({}) };
const json = (body: unknown, method = "POST") => new Request("http://x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

run("SSO einrichten (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  let orgA = "";
  let orgB = "";
  const domain = `kunde-${tag}.example`;
  const base = { issuer: ISSUER, clientId: "cid", clientSecret: "top-secret-value", groupsClaim: "groups", roleMappings: { company_admin: ["a"], mentor: [], learner: [] }, enabled: false, enforceSso: false, fetcher };

  beforeAll(async () => {
    const d = getDb();
    orgA = (await d.insert(organizations).values({ name: `CSsoA ${tag}` }).returning())[0].id;
    orgB = (await d.insert(organizations).values({ name: `CSsoB ${tag}` }).returning())[0].id;
    for (const [k, org, role] of [["adminA", orgA, "company_admin"], ["mentorA", orgA, "mentor"], ["adminB", orgB, "company_admin"]] as const) {
      const [u] = await d.insert(users).values({ email: `${k}-${tag}@test.example`, passwordHash: "x", name: k }).returning({ id: users.id });
      ids[k] = u.id;
      await d.insert(organizationMemberships).values({ organizationId: org, userId: u.id, role });
    }
  });
  afterAll(async () => {
    await getDb().delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await getDb().delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  it("nur der Firmen-Admin darf lesen und ändern", async () => {
    authMock.mockResolvedValue({ user: { id: ids.mentorA } });
    expect((await ssoGet()).status).toBe(403);
    expect((await ssoPut(json({ ...base, fetcher: undefined }, "PUT"))).status).toBe(403);
    expect((await domainPost(json({ domain }))).status).toBe(403);
    authMock.mockResolvedValue(null);
    expect((await ssoGet()).status).toBe(401);
    authMock.mockResolvedValue({ user: { id: ids.adminA } });
    expect((await ssoGet()).status).toBe(200);
  });

  it("Domains: ungültig, öffentlicher Mail-Anbieter, doppelt; bestätigen per DNS-TXT; falscher oder fehlender Eintrag bestätigt nicht", async () => {
    await expect(addDomain(orgA, ids.adminA, "kein domain")).rejects.toBeInstanceOf(SsoConfigError);
    await expect(addDomain(orgA, ids.adminA, "gmail.com")).rejects.toBeInstanceOf(SsoConfigError);
    await addDomain(orgA, ids.adminA, `@${domain.toUpperCase()}`);
    await expect(addDomain(orgA, ids.adminA, domain)).rejects.toBeInstanceOf(SsoConfigError);
    const [row] = await getDb().select().from(organizationDomains).where(eq(organizationDomains.organizationId, orgA));
    expect(row.domain).toBe(domain);
    const view = await getSsoView(orgA);
    expect(view.domains[0]).toMatchObject({ verified: false, recordName: `_proofpath-verify.${domain}`, recordValue: `proofpath-verify=${row.verificationToken}` });
    expect(await verifyDomain(orgA, ids.adminA, row.id, async () => [["proofpath-verify=falsch"]])).toBe(false);
    expect(await verifyDomain(orgA, ids.adminA, row.id, async () => { throw new Error("ENOTFOUND"); })).toBe(false);
    expect(await verifyDomain(orgA, ids.adminA, row.id, async () => [["x"], ["proofpath-verify=", row.verificationToken]])).toBe(true); // in Teilen geliefertes TXT
    // Firma B darf die Domain von A nicht per Verifikation von A bestätigen oder fremde Domain-IDs ansprechen
    await expect(verifyDomain(orgB, ids.adminB, row.id, async () => [[`proofpath-verify=${row.verificationToken}`]])).rejects.toBeInstanceOf(SsoConfigError);
  });

  it("eine bestätigte Domain gehört genau einer Firma", async () => {
    await addDomain(orgB, ids.adminB, domain);
    const [rowB] = await getDb().select().from(organizationDomains).where(eq(organizationDomains.organizationId, orgB));
    await expect(verifyDomain(orgB, ids.adminB, rowB.id, async () => [[`proofpath-verify=${rowB.verificationToken}`]])).rejects.toThrow(/anderen Firma/);
    await removeDomain(orgB, ids.adminB, rowB.id);
  });

  it("Speichern: Geheimnis nötig und nie zurück; Einschalten nur mit bestätigter Domain und erreichbarem Anmeldedienst", async () => {
    await expect(saveSsoConfig({ ...base, organizationId: orgA, actorUserId: ids.adminA, clientSecret: null })).rejects.toThrow(/Geheimnis/);
    await expect(saveSsoConfig({ ...base, organizationId: orgA, actorUserId: ids.adminA, issuer: "http://unsicher.test" })).rejects.toThrow(/https/);
    const view = await saveSsoConfig({ ...base, organizationId: orgA, actorUserId: ids.adminA });
    expect(view.hasSecret).toBe(true);
    expect(JSON.stringify(view)).not.toContain("top-secret-value");
    const [stored] = await getDb().select().from(organizationSso).where(eq(organizationSso.organizationId, orgA));
    expect(stored.clientSecretEncrypted).not.toContain("top-secret-value");
    // erreichbarer Dienst fehlt -> Einschalten scheitert
    const broken: Fetcher = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await expect(saveSsoConfig({ ...base, organizationId: orgA, actorUserId: ids.adminA, clientSecret: null, enabled: true, fetcher: broken })).rejects.toThrow(/Anmeldedienst/);
    // Passwort sperren ohne SSO
    await expect(saveSsoConfig({ ...base, organizationId: orgA, actorUserId: ids.adminA, clientSecret: null, enabled: false, enforceSso: true })).rejects.toBeInstanceOf(SsoConfigError);
    const on = await saveSsoConfig({ ...base, organizationId: orgA, actorUserId: ids.adminA, clientSecret: null, enabled: true, enforceSso: true });
    expect(on).toMatchObject({ enabled: true, enforceSso: true, hasSecret: true });
  });

  it("Firma B sieht und ändert nichts von Firma A; ohne bestätigte Domain lässt sich SSO nicht einschalten", async () => {
    expect((await getSsoView(orgB)).configured).toBe(false);
    await expect(saveSsoConfig({ ...base, organizationId: orgB, actorUserId: ids.adminB, enabled: true })).rejects.toThrow(/Domain/);
  });

  it("Entfernt die Firma die letzte bestätigte Domain, wird SSO ausgeschaltet", async () => {
    const [row] = await getDb().select().from(organizationDomains).where(eq(organizationDomains.organizationId, orgA));
    await removeDomain(orgA, ids.adminA, row.id);
    const [sso] = await getDb().select().from(organizationSso).where(eq(organizationSso.organizationId, orgA));
    expect(sso).toMatchObject({ enabled: false, enforceSso: false });
  });
});
