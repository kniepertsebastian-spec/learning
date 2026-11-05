import { createHash, randomBytes } from "node:crypto";
import { createLocalJWKSet, jwtVerify, type JWTPayload } from "jose";
import { guardedRequest, ResponseTooLargeError } from "@/lib/server/network/guarded-request";

/**
 * OpenID Connect (Authorization-Code-Fluss mit PKCE) gegen den IdP einer Firma. Alle Abrufe laufen über `Fetcher`
 * (Standard: SSRF-geschützt, nur öffentliche https-Adressen, keine Weiterleitungen, Zeit- und Größenlimit); Tests speisen einen
 * eigenen ein. Geprüft wird, was die Spezifikation verlangt: Aussteller, Empfänger (client_id), Signatur gegen die Schlüssel
 * des IdP, Ablauf und die Nonce der Anmeldung.
 */
export class OidcError extends Error {}

export type Fetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;

export const safeFetcher: Fetcher = async (url, init) => {
  if (!url.startsWith("https://")) throw new OidcError("Der IdP muss über https erreichbar sein.");
  try {
    const response = await guardedRequest(
      url,
      { method: init?.method, headers: init?.headers, body: init?.body, timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES },
      // Ein IdP im eigenen Netz (z. B. Keycloak auf einem Firmenserver) ist nur erlaubt, wenn der Betreiber es ausdrücklich einschaltet.
      { allowPrivateNetwork: process.env.SSO_ALLOW_PRIVATE_IDP === "true" },
    );
    if (response.status >= 300 && response.status < 400) throw new OidcError("Der IdP antwortet mit einer Weiterleitung; bitte die endgültige Adresse angeben.");
    const text = response.body.toString("utf8");
    return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => JSON.parse(text) as unknown };
  } catch (error) {
    if (error instanceof OidcError) throw error;
    if (error instanceof ResponseTooLargeError) throw new OidcError("Die Antwort des IdP ist zu groß.");
    throw new OidcError(`IdP nicht erreichbar: ${(error as Error).message}`);
  }
};

export type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };

const isHttps = (value: unknown): value is string => typeof value === "string" && value.startsWith("https://");

/** Holt und prüft die Beschreibung des IdP. Der darin genannte Aussteller muss exakt der konfigurierte sein. */
export async function discover(issuer: string, fetcher: Fetcher = safeFetcher): Promise<Discovery> {
  const base = issuer.replace(/\/+$/, "");
  if (!isHttps(base)) throw new OidcError("Die Aussteller-Adresse muss mit https:// beginnen.");
  const response = await fetcher(`${base}/.well-known/openid-configuration`);
  if (!response.ok) throw new OidcError(`Die Beschreibung des IdP ist nicht abrufbar (Status ${response.status}).`);
  const doc = (await response.json()) as Record<string, unknown>;
  if (typeof doc.issuer !== "string" || doc.issuer.replace(/\/+$/, "") !== base) throw new OidcError("Der Aussteller in der Beschreibung des IdP passt nicht zur konfigurierten Adresse.");
  if (!isHttps(doc.authorization_endpoint) || !isHttps(doc.token_endpoint) || !isHttps(doc.jwks_uri)) {
    throw new OidcError("Die Beschreibung des IdP ist unvollständig (Endpunkte müssen https verwenden).");
  }
  return { issuer: doc.issuer, authorization_endpoint: doc.authorization_endpoint, token_endpoint: doc.token_endpoint, jwks_uri: doc.jwks_uri };
}

const b64url = (buffer: Buffer) => buffer.toString("base64url");

export function newAuthRequestSecrets() {
  const verifier = b64url(randomBytes(48));
  return {
    state: b64url(randomBytes(24)),
    nonce: b64url(randomBytes(24)),
    verifier,
    challenge: b64url(createHash("sha256").update(verifier).digest()),
  };
}

export function buildAuthorizationUrl(input: { discovery: Discovery; clientId: string; redirectUri: string; state: string; nonce: string; challenge: string; loginHint?: string }): string {
  const url = new URL(input.discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}

/** Tauscht den Code gegen das ID-Token (Client-Geheimnis im Body, PKCE-Verifier). */
export async function exchangeCode(
  input: { discovery: Discovery; clientId: string; clientSecret: string; redirectUri: string; code: string; verifier: string },
  fetcher: Fetcher = safeFetcher,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code_verifier: input.verifier,
  }).toString();
  const response = await fetcher(input.discovery.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  if (!response.ok) throw new OidcError(`Der IdP hat den Code abgelehnt (Status ${response.status}).`);
  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data.id_token !== "string") throw new OidcError("Der IdP hat kein ID-Token geliefert.");
  return data.id_token;
}

export type IdTokenClaims = JWTPayload & { sub: string; email?: string; preferred_username?: string; name?: string };

/** Prüft Signatur, Aussteller, Empfänger, Ablauf und Nonce des ID-Tokens. */
export async function verifyIdToken(
  idToken: string,
  input: { discovery: Discovery; clientId: string; nonce: string },
  fetcher: Fetcher = safeFetcher,
): Promise<IdTokenClaims> {
  const response = await fetcher(input.discovery.jwks_uri);
  if (!response.ok) throw new OidcError("Die Schlüssel des IdP sind nicht abrufbar.");
  const jwks = (await response.json()) as Parameters<typeof createLocalJWKSet>[0];
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, createLocalJWKSet(jwks), {
      issuer: input.discovery.issuer,
      audience: input.clientId,
      algorithms: ["RS256", "RS384", "RS512", "PS256", "ES256", "ES384"],
      requiredClaims: ["exp", "iat", "sub"],
      clockTolerance: 60,
    }));
  } catch (error) {
    throw new OidcError(`Das ID-Token ist ungültig: ${(error as Error).message}`);
  }
  if (payload.nonce !== input.nonce) throw new OidcError("Das ID-Token gehört nicht zu dieser Anmeldung (Nonce).");
  return payload as IdTokenClaims;
}
