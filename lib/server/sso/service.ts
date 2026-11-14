import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { decryptSecret } from "@/lib/server/crypto/secret-box";
import { getDb } from "@/lib/server/db/client";
import {
  organizationDomains,
  organizationMemberships,
  organizationSso,
  ssoLoginTickets,
  userIdentities,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { normalizeEmail } from "@/lib/server/email";
import { buildAuthorizationUrl, discover, exchangeCode, newAuthRequestSecrets, OidcError, safeFetcher, verifyIdToken, type Fetcher } from "./oidc";

/** Die Anmeldung über das Firmenkonto ist fehlgeschlagen. Die Meldung ist für die Person bestimmt (keine Interna). */
export class SsoError extends Error {}

const COOKIE_TTL_S = 600;
const TICKET_TTL_MS = 60_000;
const ROLE_RANK: Record<CompanyRole, number> = { learner: 0, mentor: 1, company_admin: 2 };

export const SSO_COOKIE = "sso_state";

function secretKey(): string {
  const key = process.env.AUTH_SECRET;
  if (!key) throw new SsoError("AUTH_SECRET ist nicht gesetzt.");
  return key;
}

const sign = (payload: string) => createHmac("sha256", secretKey()).update(payload).digest("base64url");

/** Zustand der laufenden Anmeldung (state, nonce, PKCE-Verifier, Firma) als signierter, kurzlebiger Cookie-Wert. */
export function sealState(data: { state: string; nonce: string; verifier: string; organizationId: string }, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: now + COOKIE_TTL_S * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function openState(value: string | undefined, now = Date.now()): { state: string; nonce: string; verifier: string; organizationId: string } | null {
  if (!value) return null;
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (typeof data.exp !== "number" || data.exp < now) return null;
    if (![data.state, data.nonce, data.verifier, data.organizationId].every((v) => typeof v === "string")) return null;
    return data;
  } catch {
    return null;
  }
}

export function redirectUri(): string {
  const base = (process.env.APP_BASE_URL || process.env.APP_URL || process.env.AUTH_URL || "").replace(/\/+$/, "");
  if (!base) throw new SsoError("APP_BASE_URL ist nicht gesetzt.");
  return `${base}/api/sso/callback`;
}

/** Firma, die diese Adresse per SSO anmelden darf: bestätigte Domain UND eingeschaltetes SSO. */
export async function findSsoOrganization(rawEmail: string): Promise<string | null> {
  const domain = normalizeEmail(rawEmail).split("@")[1];
  if (!domain) return null;
  const [row] = await getDb()
    .select({ organizationId: organizationDomains.organizationId })
    .from(organizationDomains)
    .innerJoin(organizationSso, eq(organizationSso.organizationId, organizationDomains.organizationId))
    .where(and(eq(organizationDomains.domain, domain), sql`${organizationDomains.verifiedAt} is not null`, eq(organizationSso.enabled, true)))
    .limit(1);
  return row?.organizationId ?? null;
}

/** Beginnt die Anmeldung: Adresse des IdP und der Wert für den Zustands-Cookie. */
export async function startSso(rawEmail: string, fetcher: Fetcher = safeFetcher): Promise<{ url: string; cookie: string }> {
  const email = normalizeEmail(rawEmail);
  const organizationId = await findSsoOrganization(email);
  if (!organizationId) throw new SsoError("Für diese E-Mail-Adresse ist keine Anmeldung über ein Firmenkonto eingerichtet.");
  const [config] = await getDb().select().from(organizationSso).where(eq(organizationSso.organizationId, organizationId)).limit(1);
  let discovery;
  try {
    discovery = await discover(config.issuer, fetcher);
  } catch (error) {
    if (error instanceof OidcError) throw new SsoError("Der Anmeldedienst der Firma ist gerade nicht erreichbar oder falsch eingerichtet.");
    throw error;
  }
  const secrets = newAuthRequestSecrets();
  const url = buildAuthorizationUrl({ discovery, clientId: config.clientId, redirectUri: redirectUri(), state: secrets.state, nonce: secrets.nonce, challenge: secrets.challenge, loginHint: email });
  return { url, cookie: sealState({ state: secrets.state, nonce: secrets.nonce, verifier: secrets.verifier, organizationId }) };
}

/** Rolle aus den Gruppen: die höchste Rolle, für die irgendeine zugeordnete Gruppe vorkommt; sonst Lernende/r. */
export function roleFromGroups(groups: string[], mappings: Record<CompanyRole, string[]>): CompanyRole {
  const have = new Set(groups.map((g) => g.trim().toLowerCase()));
  let best: CompanyRole = "learner";
  for (const role of ["mentor", "company_admin"] as const) {
    if ((mappings[role] ?? []).some((g) => have.has(g.trim().toLowerCase())) && ROLE_RANK[role] > ROLE_RANK[best]) best = role;
  }
  return best;
}

function groupsOf(claims: Record<string, unknown>, claimName: string): string[] {
  const value = claims[claimName];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

/** Sicher unbrauchbares Passwort für per SSO angelegte Konten (die Person meldet sich nie damit an). */
const unusablePasswordHash = () => bcrypt.hash(randomBytes(32).toString("hex"), 10);

async function verifiedDomains(organizationId: string): Promise<Set<string>> {
  const rows = await getDb().select({ domain: organizationDomains.domain }).from(organizationDomains).where(and(eq(organizationDomains.organizationId, organizationId), sql`${organizationDomains.verifiedAt} is not null`));
  return new Set(rows.map((r) => r.domain));
}

/**
 * Legt Konto und Mitgliedschaft an oder aktualisiert sie. Sicherheitsregeln: die Adresse muss zu einer bestätigten Domain DIESER
 * Firma gehören; ein Konto, das schon zu einer anderen Firma gehört, wird nie übernommen; beim ersten Verknüpfen eines bestehenden
 * Kontos werden alte Sitzungen beendet und ein unbestätigtes Konto verliert sein altes Passwort (es könnte jemand anderem gehören).
 * Der letzte Firmen-Admin wird nie durch die Gruppen herabgestuft.
 */
export async function provisionUser(input: { organizationId: string; issuer: string; subject: string; email: string; name: string | null; role: CompanyRole }): Promise<{ userId: string; created: boolean }> {
  const db = getDb();
  const email = normalizeEmail(input.email);
  const domain = email.split("@")[1];
  if (!domain || !(await verifiedDomains(input.organizationId)).has(domain)) throw new SsoError("Die E-Mail-Adresse gehört nicht zu einer bestätigten Domain der Firma.");

  return db.transaction(async (tx) => {
    let userId: string | null = null;
    let created = false;
    const [identity] = await tx.select().from(userIdentities).where(and(eq(userIdentities.issuer, input.issuer), eq(userIdentities.subject, input.subject))).limit(1);
    if (identity) {
      if (identity.organizationId !== input.organizationId) throw new SsoError("Diese Identität gehört zu einer anderen Firma.");
      userId = identity.userId;
      await tx.update(userIdentities).set({ lastLoginAt: new Date() }).where(eq(userIdentities.id, identity.id));
    } else {
      const [existing] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing) {
        const [other] = await tx.select({ organizationId: organizationMemberships.organizationId }).from(organizationMemberships).where(eq(organizationMemberships.userId, existing.id)).limit(1);
        if (other && other.organizationId !== input.organizationId) throw new SsoError("Dieses Konto gehört bereits zu einer anderen Firma.");
        userId = existing.id;
        await tx
          .update(users)
          .set({
            sessionVersion: sql`${users.sessionVersion} + 1`,
            ...(existing.emailVerifiedAt ? {} : { emailVerifiedAt: new Date(), passwordHash: await unusablePasswordHash(), passwordSet: false }),
          })
          .where(eq(users.id, existing.id));
      } else {
        const [row] = await tx.insert(users).values({ email, name: input.name, passwordHash: await unusablePasswordHash(), passwordSet: false, emailVerifiedAt: new Date() }).returning({ id: users.id });
        userId = row.id;
        created = true;
      }
      await tx.insert(userIdentities).values({ userId, organizationId: input.organizationId, issuer: input.issuer, subject: input.subject, lastLoginAt: new Date() });
    }

    const [membership] = await tx.select().from(organizationMemberships).where(eq(organizationMemberships.userId, userId)).limit(1);
    if (!membership) {
      await tx.insert(organizationMemberships).values({ organizationId: input.organizationId, userId, role: input.role });
    } else if (membership.organizationId !== input.organizationId) {
      throw new SsoError("Dieses Konto gehört bereits zu einer anderen Firma.");
    } else if (membership.role !== input.role) {
      let role = input.role;
      if (membership.role === "company_admin" && role !== "company_admin") {
        const [{ admins }] = await tx
          .select({ admins: sql<number>`count(*)::int` })
          .from(organizationMemberships)
          .where(and(eq(organizationMemberships.organizationId, input.organizationId), eq(organizationMemberships.role, "company_admin")));
        if (admins <= 1) role = "company_admin";
      }
      await tx.update(organizationMemberships).set({ role }).where(eq(organizationMemberships.id, membership.id));
    }
    return { userId, created };
  });
}

/** Erzeugt das einmalige Anmelde-Ticket (Klartext nur hier, in der Datenbank nur der Hash). */
export async function createLoginTicket(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getDb().insert(ssoLoginTickets).values({ tokenHash: createHash("sha256").update(token).digest("hex"), userId, expiresAt: new Date(Date.now() + TICKET_TTL_MS) });
  return token;
}

/** Löst ein Ticket genau einmal ein. */
export async function consumeLoginTicket(token: string): Promise<{ id: string; email: string; name: string | null; sessionVersion: number } | null> {
  const hash = createHash("sha256").update(token).digest("hex");
  const [ticket] = await getDb().delete(ssoLoginTickets).where(and(eq(ssoLoginTickets.tokenHash, hash), gt(ssoLoginTickets.expiresAt, new Date()))).returning();
  if (!ticket) return null;
  const [user] = await getDb().select().from(users).where(eq(users.id, ticket.userId)).limit(1);
  return user ? { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion } : null;
}

/** Schließt die Anmeldung ab (Rückkehr vom IdP). Liefert das Ticket für die Sitzung. */
export async function completeSso(input: { code: string; state: string; cookie: string | undefined }, fetcher: Fetcher = safeFetcher): Promise<{ ticket: string; userId: string; created: boolean }> {
  const sealed = openState(input.cookie);
  if (!sealed || sealed.state !== input.state) throw new SsoError("Die Anmeldung ist abgelaufen oder gehört nicht zu diesem Browser. Bitte noch einmal beginnen.");
  const [config] = await getDb().select().from(organizationSso).where(eq(organizationSso.organizationId, sealed.organizationId)).limit(1);
  if (!config || !config.enabled) throw new SsoError("Die Anmeldung über das Firmenkonto ist nicht eingeschaltet.");
  try {
    const discovery = await discover(config.issuer, fetcher);
    const idToken = await exchangeCode({ discovery, clientId: config.clientId, clientSecret: decryptSecret(config.clientSecretEncrypted), redirectUri: redirectUri(), code: input.code, verifier: sealed.verifier }, fetcher);
    const claims = await verifyIdToken(idToken, { discovery, clientId: config.clientId, nonce: sealed.nonce }, fetcher);
    const email = typeof claims.email === "string" ? claims.email : typeof claims.preferred_username === "string" && claims.preferred_username.includes("@") ? claims.preferred_username : null;
    if (!email) throw new SsoError("Der Anmeldedienst hat keine E-Mail-Adresse geliefert.");
    const role = roleFromGroups(groupsOf(claims, config.groupsClaim), config.roleMappings);
    const { userId, created } = await provisionUser({ organizationId: sealed.organizationId, issuer: discovery.issuer, subject: claims.sub, email, name: typeof claims.name === "string" ? claims.name.slice(0, 200) : null, role });
    await recordAuditEvent({ actorUserId: userId, action: created ? "sso.user_created" : "sso.login", targetType: "organization", targetId: sealed.organizationId, metadata: { role } }).catch((e) => console.error("Audit-Log fehlgeschlagen:", e));
    return { ticket: await createLoginTicket(userId), userId, created };
  } catch (error) {
    if (error instanceof OidcError) {
      console.error("SSO fehlgeschlagen:", error.message);
      throw new SsoError("Die Anmeldung über das Firmenkonto ist fehlgeschlagen.");
    }
    throw error;
  }
}

/** Darf diese Person sich noch mit Passwort anmelden? Nicht, wenn die Firma SSO erzwingt (Firmen-Admins behalten den Notzugang). */
export async function passwordLoginAllowed(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ role: organizationMemberships.role, enforce: organizationSso.enforceSso, enabled: organizationSso.enabled })
    .from(organizationMemberships)
    .innerJoin(organizationSso, eq(organizationSso.organizationId, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.userId, userId))
    .limit(1);
  return !(row && row.enabled && row.enforce && row.role !== "company_admin");
}
