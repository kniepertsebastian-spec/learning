/**
 * Tests für den KI-Zugang der Firma (unser Zugang oder eigener Schlüssel, BYOK) gegen eine ECHTE Postgres-Datenbank.
 * Der Aufruf bei Google wird ersetzt. Wie company-access.test.ts nur mit TEST_DATABASE_URL, sonst übersprungen.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));
const limit = vi.hoisted(() => ({ enforce: false }));
vi.mock("@/lib/server/auth-rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/auth-rate-limit")>();
  return {
    ...real,
    checkAiSettingsRateLimit: (userId: string) => (limit.enforce ? real.checkAiSettingsRateLimit(userId) : { allowed: true, retryAfterSeconds: 0 }),
  };
});

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { auditEvents, organizationAiSettings, organizationMemberships, organizations, users, type CompanyRole } from "@/lib/server/db/schema";
import { DELETE as deleteKeyRoute } from "@/app/api/company/ai-settings/key/route";
import { GET as getRoute, PUT as putRoute } from "@/app/api/company/ai-settings/route";
import { AI_SETTINGS_VIEW_FIELDS, resolveAiAccess } from "./ai-settings";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (userId: string | null) => authMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
const put = (body: unknown) => putRoute(new Request("http://localhost/api", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

const KEY = "AIzaSyTest0123456789abcdefGHIJKLmnop"; // kein echter Schlüssel
const KEY2 = "AIzaSyOther0123456789abcdefGHIJKLmn";

run("KI-Zugang der Firma (echte DB, Google ersetzt)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  let orgA = "";
  let orgB = "";
  const fetchMock = vi.fn();
  const googleSays = (status: number) => fetchMock.mockResolvedValue(new Response("{}", { status }));
  const originalKey = process.env.APP_ENCRYPTION_KEY;
  const testKey = randomBytes(32).toString("base64"); // bleibt für alle Tests gleich, sonst wären gespeicherte Schlüssel nicht lesbar

  async function makeUser(key: string) {
    const [u] = await getDb().insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key }).returning({ id: users.id });
    ids[key] = u.id;
  }
  const addMember = (orgId: string, key: string, role: CompanyRole) =>
    getDb().insert(organizationMemberships).values({ organizationId: orgId, userId: ids[key], role });
  const row = async (orgId: string) => (await getDb().select().from(organizationAiSettings).where(eq(organizationAiSettings.organizationId, orgId)))[0];

  beforeAll(async () => {
    const db = getDb();
    orgA = (await db.insert(organizations).values({ name: `KiA ${tag}` }).returning())[0].id;
    orgB = (await db.insert(organizations).values({ name: `KiB ${tag}` }).returning())[0].id;
    for (const k of ["adminA", "mentorA", "learnerA", "adminB", "loner"]) await makeUser(k);
    await addMember(orgA, "adminA", "company_admin");
    await addMember(orgA, "mentorA", "mentor");
    await addMember(orgA, "learnerA", "learner");
    await addMember(orgB, "adminB", "company_admin");
  });
  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
    if (originalKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = originalKey;
  });
  beforeEach(() => {
    authMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.APP_ENCRYPTION_KEY = testKey;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("Zugriff: nur Firmen-Admins (Mentoren, Lernende, Fremde nicht)", async () => {
    signInAs(null);
    expect((await getRoute()).status).toBe(401);
    for (const k of ["mentorA", "learnerA", "loner"]) {
      signInAs(ids[k]);
      expect((await getRoute()).status, k).toBe(403);
      expect((await put({ mode: "platform" })).status, k).toBe(403);
      expect((await deleteKeyRoute()).status, k).toBe(403);
    }
    expect(await row(orgA)).toBeUndefined();
  });

  it("anfangs nicht eingerichtet; die Ansicht hat nur die freigegebenen Felder", async () => {
    signInAs(ids.adminA);
    const view = await (await getRoute()).json();
    expect(Object.keys(view).sort()).toEqual([...AI_SETTINGS_VIEW_FIELDS].sort());
    expect(view).toMatchObject({ mode: null, hasKey: false, keyLast4: null, encryptionConfigured: true });
    expect(await resolveAiAccess(orgA)).toEqual({ kind: "none", reason: "not_configured" });
  });

  it("unser Zugang: Modus wird gesetzt, kein Aufruf bei Google", async () => {
    signInAs(ids.adminA);
    const res = await put({ mode: "platform" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "platform", hasKey: false });
    expect(await resolveAiAccess(orgA)).toEqual({ kind: "platform" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("eigener Schlüssel: ohne Schlüssel 400; ungültige Form 400 ohne Aufruf; falscher Schlüssel 400; Google down 502; nichts wird gespeichert", async () => {
    signInAs(ids.adminA);
    expect((await put({ mode: "byok" })).status).toBe(400);
    expect((await put({ mode: "byok", apiKey: "mit Leerzeichen und zu kurz" })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    googleSays(403);
    expect((await put({ mode: "byok", apiKey: KEY })).status).toBe(400);
    googleSays(503);
    expect((await put({ mode: "byok", apiKey: KEY })).status).toBe(502);
    fetchMock.mockRejectedValue(new Error("netzwerk"));
    expect((await put({ mode: "byok", apiKey: KEY })).status).toBe(502);
    const r = await row(orgA);
    expect(r.mode).toBe("platform"); // unverändert
    expect(r.keyEncrypted).toBeNull();
  });

  it("eigener Schlüssel gültig: verschlüsselt gespeichert, nie zurückgegeben, nur der Header geht an Google", async () => {
    googleSays(200);
    signInAs(ids.adminA);
    const res = await put({ mode: "byok", apiKey: `  ${KEY}  ` });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain(KEY);
    expect(JSON.parse(body)).toMatchObject({ mode: "byok", hasKey: true, keyLast4: KEY.slice(-4) });
    expect(Object.keys(JSON.parse(body)).sort()).toEqual([...AI_SETTINGS_VIEW_FIELDS].sort()); // auch mit gespeichertem Schlüssel keine weiteren Felder

    // Google wird nur am festen Host angefragt, der Schlüssel steht nur im Header, nie in der Adresse
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url as string).host).toBe("generativelanguage.googleapis.com");
    expect(url as string).not.toContain(KEY);
    expect((init as RequestInit).headers).toEqual({ "x-goog-api-key": KEY });

    // in der Datenbank nur verschlüsselt
    const r = await row(orgA);
    expect(r.keyEncrypted?.startsWith("v1.")).toBe(true);
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(r.keyLast4).toBe(KEY.slice(-4));
    expect(await resolveAiAccess(orgA)).toEqual({ kind: "byok", apiKey: KEY });

    // GET gibt ihn auch später nicht her
    const later = await (await getRoute()).json();
    expect(Object.keys(later).sort()).toEqual([...AI_SETTINGS_VIEW_FIELDS].sort());
    expect(JSON.stringify(later)).not.toContain(KEY);
    // Audit ohne Schlüssel
    const events = await getDb().select().from(auditEvents).where(eq(auditEvents.targetId, orgA));
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(["ai_settings.mode_changed", "ai_settings.key_set"]));
    expect(JSON.stringify(events)).not.toContain(KEY);
    expect(JSON.stringify(events)).not.toContain(KEY.slice(-4));
  });

  it("Moduswechsel behält den Schlüssel, ein neuer Schlüssel ersetzt ihn", async () => {
    signInAs(ids.adminA);
    expect((await put({ mode: "platform" })).status).toBe(200);
    expect(await resolveAiAccess(orgA)).toEqual({ kind: "platform" });
    const back = await put({ mode: "byok" }); // Schlüssel noch gespeichert, kein neuer nötig
    expect(back.status).toBe(200);
    expect(await resolveAiAccess(orgA)).toEqual({ kind: "byok", apiKey: KEY });
    googleSays(200);
    expect((await put({ mode: "byok", apiKey: KEY2 })).status).toBe(200);
    expect(await resolveAiAccess(orgA)).toEqual({ kind: "byok", apiKey: KEY2 });
  });

  it("Mandantentrennung: Firma B sieht und nutzt nichts von A", async () => {
    signInAs(ids.adminB);
    expect(await (await getRoute()).json()).toMatchObject({ mode: null, hasKey: false });
    expect(await resolveAiAccess(orgB)).toEqual({ kind: "none", reason: "not_configured" });
    expect((await deleteKeyRoute()).status).toBe(404); // B hat nichts zu entfernen, A's Schlüssel bleibt
    expect((await row(orgA)).keyEncrypted).not.toBeNull();
  });

  it("ohne APP_ENCRYPTION_KEY: eigene Schlüssel 503, unser Zugang geht weiter; Ansicht meldet es", async () => {
    delete process.env.APP_ENCRYPTION_KEY;
    googleSays(200);
    signInAs(ids.adminB);
    expect((await put({ mode: "byok", apiKey: KEY })).status).toBe(503);
    expect(await (await getRoute()).json()).toMatchObject({ encryptionConfigured: false });
    expect((await put({ mode: "platform" })).status).toBe(200);
    expect((await row(orgB)).keyEncrypted).toBeNull();
  });

  it("Schlüssel nicht mehr lesbar (anderer Verschlüsselungsschlüssel oder veränderter Wert): kein Zugriff statt Absturz", async () => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64"); // anderer Schlüssel als beim Speichern
    expect(await resolveAiAccess(orgA)).toEqual({ kind: "none", reason: "key_unreadable" });
  });

  it("Schlüssel entfernen: 204, bei eigenem Schlüssel danach nicht mehr eingerichtet, doppelt 404", async () => {
    signInAs(ids.adminA);
    expect((await deleteKeyRoute()).status).toBe(204);
    const r = await row(orgA);
    expect(r).toMatchObject({ keyEncrypted: null, keyLast4: null, mode: null });
    expect(await resolveAiAccess(orgA)).toEqual({ kind: "none", reason: "not_configured" });
    // unser Zugang bleibt, wenn nur der Schlüssel entfernt wird
    expect((await put({ mode: "platform" })).status).toBe(200);
    expect((await deleteKeyRoute()).status).toBe(204);
    expect((await row(orgA)).mode).toBe("platform");
    const events = await getDb().select().from(auditEvents).where(eq(auditEvents.targetId, orgA));
    expect(events.map((e) => e.action)).toContain("ai_settings.key_removed");
  });

  it("ungültige Anfragen und Rate-Limit", async () => {
    signInAs(ids.adminA);
    expect((await put({ mode: "geheim" })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect((await putRoute(new Request("http://localhost/api", { method: "PUT", body: "{" }))).status).toBe(400);
    limit.enforce = true;
    try {
      let last = 0;
      for (let i = 0; i < 11; i++) last = (await put({ mode: "platform" })).status;
      expect(last).toBe(429);
    } finally {
      limit.enforce = false;
    }
  });
});
