import { resolveTxt } from "node:dns/promises";
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { encryptSecret, isEncryptionConfigured } from "@/lib/server/crypto/secret-box";
import { getDb } from "@/lib/server/db/client";
import { organizationDomains, organizationSso, type CompanyRole } from "@/lib/server/db/schema";
import { discover, OidcError, type Fetcher } from "@/lib/server/sso/oidc";
import { redirectUri } from "@/lib/server/sso/service";

/**
 * Firmenkonto-Anmeldung (OIDC) einer Firma einrichten: Aussteller, Client, Gruppen→Rollen, Domains mit DNS-Bestätigung. Nur
 * der Firmen-Admin (Route). Das Client-Geheimnis liegt verschlüsselt und kommt nie zurück. SSO lässt sich erst einschalten, wenn
 * der Anmeldedienst erreichbar ist und mindestens eine Domain bestätigt wurde.
 */
export class SsoConfigError extends Error {}
export class EncryptionUnavailableError extends Error {}

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

export const VERIFY_PREFIX = "_proofpath-verify";
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "gmx.de", "gmx.net", "web.de", "t-online.de", "proton.me", "protonmail.com", "aol.com"]);
const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type SsoView = {
  configured: boolean;
  enabled: boolean;
  issuer: string;
  clientId: string;
  hasSecret: boolean;
  groupsClaim: string;
  roleMappings: Record<CompanyRole, string[]>;
  enforceSso: boolean;
  redirectUri: string | null;
  encryptionConfigured: boolean;
  domains: { id: string; domain: string; verified: boolean; recordName: string; recordValue: string }[];
};

const emptyMappings = (): Record<CompanyRole, string[]> => ({ company_admin: [], mentor: [], learner: [] });

export async function getSsoView(organizationId: string): Promise<SsoView> {
  const db = getDb();
  const [row] = await db.select().from(organizationSso).where(eq(organizationSso.organizationId, organizationId)).limit(1);
  const domains = await db.select().from(organizationDomains).where(eq(organizationDomains.organizationId, organizationId)).orderBy(asc(organizationDomains.domain));
  let uri: string | null = null;
  try {
    uri = redirectUri();
  } catch {
    uri = null;
  }
  return {
    configured: Boolean(row),
    enabled: row?.enabled ?? false,
    issuer: row?.issuer ?? "",
    clientId: row?.clientId ?? "",
    hasSecret: Boolean(row?.clientSecretEncrypted),
    groupsClaim: row?.groupsClaim ?? "groups",
    roleMappings: { ...emptyMappings(), ...(row?.roleMappings ?? {}) },
    enforceSso: row?.enforceSso ?? false,
    redirectUri: uri,
    encryptionConfigured: isEncryptionConfigured(),
    domains: domains.map((d) => ({ id: d.id, domain: d.domain, verified: Boolean(d.verifiedAt), recordName: `${VERIFY_PREFIX}.${d.domain}`, recordValue: `proofpath-verify=${d.verificationToken}` })),
  };
}

const cleanGroups = (groups: string[]) => [...new Set(groups.map((g) => g.trim()).filter(Boolean))].slice(0, 50);

export async function saveSsoConfig(input: {
  organizationId: string;
  actorUserId: string;
  issuer: string;
  clientId: string;
  /** Leer/fehlend = vorhandenes Geheimnis behalten. */
  clientSecret?: string | null;
  groupsClaim: string;
  roleMappings: Record<CompanyRole, string[]>;
  enabled: boolean;
  enforceSso: boolean;
  fetcher?: Fetcher;
}): Promise<SsoView> {
  const db = getDb();
  const issuer = input.issuer.trim().replace(/\/+$/, "");
  const clientId = input.clientId.trim();
  const secret = input.clientSecret?.trim() || null;
  if (!issuer.startsWith("https://") || !clientId) throw new SsoConfigError("Aussteller (https://…) und Client-ID sind nötig.");
  const [existing] = await db.select().from(organizationSso).where(eq(organizationSso.organizationId, input.organizationId)).limit(1);
  if (!existing && !secret) throw new SsoConfigError("Beim ersten Speichern ist das Client-Geheimnis nötig.");
  if (secret && !isEncryptionConfigured()) throw new EncryptionUnavailableError("Auf dem Server ist kein APP_ENCRYPTION_KEY gesetzt; das Geheimnis lässt sich nicht speichern.");

  if (input.enabled || input.enforceSso) {
    const verified = (await db.select().from(organizationDomains).where(and(eq(organizationDomains.organizationId, input.organizationId)))).some((d) => d.verifiedAt);
    if (!verified) throw new SsoConfigError("Zum Einschalten muss mindestens eine E-Mail-Domain bestätigt sein.");
    try {
      await discover(issuer, input.fetcher);
    } catch (error) {
      if (error instanceof OidcError) throw new SsoConfigError(`Der Anmeldedienst lässt sich nicht verwenden: ${error.message}`);
      throw error;
    }
  }
  if (input.enforceSso && !input.enabled) throw new SsoConfigError("Das Passwort lässt sich nur sperren, wenn die Anmeldung über das Firmenkonto eingeschaltet ist.");

  const values = {
    enabled: input.enabled,
    issuer,
    clientId,
    groupsClaim: input.groupsClaim.trim() || "groups",
    roleMappings: { company_admin: cleanGroups(input.roleMappings.company_admin ?? []), mentor: cleanGroups(input.roleMappings.mentor ?? []), learner: cleanGroups(input.roleMappings.learner ?? []) },
    enforceSso: input.enforceSso,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(organizationSso).set({ ...values, ...(secret ? { clientSecretEncrypted: encryptSecret(secret) } : {}) }).where(eq(organizationSso.organizationId, input.organizationId));
  } else {
    await db.insert(organizationSso).values({ organizationId: input.organizationId, ...values, clientSecretEncrypted: encryptSecret(secret!) });
  }
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "sso.configured", targetType: "organization", targetId: input.organizationId, metadata: { enabled: input.enabled, enforceSso: input.enforceSso } }).catch(logAuditFailure);
  return getSsoView(input.organizationId);
}

export async function addDomain(organizationId: string, actorUserId: string, rawDomain: string): Promise<void> {
  const domain = rawDomain.trim().toLowerCase().replace(/^@/, "");
  if (!DOMAIN_PATTERN.test(domain)) throw new SsoConfigError("Das ist keine gültige Domain (z. B. firma.de).");
  if (FREE_MAIL.has(domain)) throw new SsoConfigError("Öffentliche Mail-Anbieter lassen sich nicht als Firmen-Domain verwenden.");
  const [dup] = await getDb().select({ id: organizationDomains.id }).from(organizationDomains).where(and(eq(organizationDomains.organizationId, organizationId), eq(organizationDomains.domain, domain))).limit(1);
  if (dup) throw new SsoConfigError("Diese Domain ist schon eingetragen.");
  await getDb().insert(organizationDomains).values({ organizationId, domain, verificationToken: randomBytes(16).toString("hex") });
  await recordAuditEvent({ actorUserId, action: "sso.domain_added", targetType: "organization", targetId: organizationId, metadata: { domain } }).catch(logAuditFailure);
}

type TxtResolver = (name: string) => Promise<string[][]>;

/** Prüft den DNS-TXT-Eintrag und bestätigt die Domain. Eine Domain, die schon eine andere Firma bestätigt hat, bleibt dort. */
export async function verifyDomain(organizationId: string, actorUserId: string, domainId: string, resolver: TxtResolver = resolveTxt): Promise<boolean> {
  const [row] = await getDb().select().from(organizationDomains).where(and(eq(organizationDomains.id, domainId), eq(organizationDomains.organizationId, organizationId))).limit(1);
  if (!row) throw new SsoConfigError("Domain nicht gefunden.");
  if (row.verifiedAt) return true;
  let records: string[][];
  try {
    records = await resolver(`${VERIFY_PREFIX}.${row.domain}`);
  } catch {
    return false;
  }
  const expected = `proofpath-verify=${row.verificationToken}`;
  if (!records.some((chunks) => chunks.join("") === expected)) return false;
  try {
    await getDb().update(organizationDomains).set({ verifiedAt: new Date() }).where(eq(organizationDomains.id, row.id));
  } catch (error) {
    const code = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? (e as { code: unknown }).code : undefined);
    const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause: unknown }).cause : undefined;
    if (code(error) === "23505" || code(cause) === "23505") throw new SsoConfigError("Diese Domain ist schon bei einer anderen Firma bestätigt.");
    throw error;
  }
  await recordAuditEvent({ actorUserId, action: "sso.domain_verified", targetType: "organization", targetId: organizationId, metadata: { domain: row.domain } }).catch(logAuditFailure);
  return true;
}

export async function removeDomain(organizationId: string, actorUserId: string, domainId: string): Promise<void> {
  const [row] = await getDb().delete(organizationDomains).where(and(eq(organizationDomains.id, domainId), eq(organizationDomains.organizationId, organizationId))).returning();
  if (!row) throw new SsoConfigError("Domain nicht gefunden.");
  // Ohne bestätigte Domain darf SSO nicht eingeschaltet bleiben.
  const left = await getDb().select().from(organizationDomains).where(eq(organizationDomains.organizationId, organizationId));
  if (!left.some((d) => d.verifiedAt)) await getDb().update(organizationSso).set({ enabled: false, enforceSso: false }).where(eq(organizationSso.organizationId, organizationId));
  await recordAuditEvent({ actorUserId, action: "sso.domain_removed", targetType: "organization", targetId: organizationId, metadata: { domain: row.domain } }).catch(logAuditFailure);
}
