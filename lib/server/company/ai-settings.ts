import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { checkGeminiKey, looksLikeApiKey } from "@/lib/server/byok/gemini-key";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/server/crypto/secret-box";
import { getDb } from "@/lib/server/db/client";
import { organizationAiSettings, type AiAccessMode } from "@/lib/server/db/schema";

/**
 * KI-Zugang einer Firma für ihre internen Lernpfade: über unseren Zugang (`platform`) oder mit dem eigenen
 * Schlüssel der Firma (`byok`). Nur der Firmen-Admin ändert das (Route). Der Schlüssel wird vor dem Speichern
 * geprüft, verschlüsselt abgelegt und nie zurückgegeben; sichtbar sind nur die letzten 4 Zeichen.
 */

export class EncryptionUnavailableError extends Error {}
export class InvalidKeyError extends Error {}
export class KeyCheckUnavailableError extends Error {}
export class KeyRequiredError extends Error {}

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

/** Das ist alles, was der Browser über den KI-Zugang erfährt: nie der Schlüssel. */
export const AI_SETTINGS_VIEW_FIELDS = ["mode", "provider", "hasKey", "keyLast4", "keyUpdatedAt", "encryptionConfigured"] as const;

export type AiSettingsView = {
  mode: AiAccessMode | null;
  provider: string;
  hasKey: boolean;
  keyLast4: string | null;
  keyUpdatedAt: Date | null;
  /** false: der Server hat keinen APP_ENCRYPTION_KEY, eigene Schlüssel lassen sich nicht speichern. */
  encryptionConfigured: boolean;
};

export async function getAiSettings(organizationId: string): Promise<AiSettingsView> {
  const [row] = await getDb().select().from(organizationAiSettings).where(eq(organizationAiSettings.organizationId, organizationId)).limit(1);
  return {
    mode: row?.mode ?? null,
    provider: row?.provider ?? "gemini",
    hasKey: Boolean(row?.keyEncrypted),
    keyLast4: row?.keyLast4 ?? null,
    keyUpdatedAt: row?.keyUpdatedAt ?? null,
    encryptionConfigured: isEncryptionConfigured(),
  };
}

/**
 * Setzt den Modus und optional einen neuen eigenen Schlüssel. `byok` braucht einen gespeicherten oder neu
 * mitgegebenen Schlüssel. Ein neuer Schlüssel wird geprüft (Google), bevor er gespeichert wird.
 */
export async function setAiSettings(input: {
  organizationId: string;
  actorUserId: string;
  mode: AiAccessMode;
  apiKey?: string | null;
  checkKey?: typeof checkGeminiKey;
}): Promise<AiSettingsView> {
  const apiKey = input.apiKey?.trim() || null;
  const db = getDb();
  const [existing] = await db.select().from(organizationAiSettings).where(eq(organizationAiSettings.organizationId, input.organizationId)).limit(1);

  let keyFields: { keyEncrypted: string; keyLast4: string; keyUpdatedAt: Date } | null = null;
  if (apiKey) {
    if (!isEncryptionConfigured()) throw new EncryptionUnavailableError();
    if (!looksLikeApiKey(apiKey)) throw new InvalidKeyError();
    const check = await (input.checkKey ?? checkGeminiKey)(apiKey);
    if (!check.ok) throw check.reason === "invalid" ? new InvalidKeyError() : new KeyCheckUnavailableError();
    keyFields = { keyEncrypted: encryptSecret(apiKey), keyLast4: apiKey.slice(-4), keyUpdatedAt: new Date() };
  }
  if (input.mode === "byok" && !keyFields && !existing?.keyEncrypted) throw new KeyRequiredError();

  const values = { mode: input.mode, updatedByUserId: input.actorUserId, updatedAt: new Date(), ...(keyFields ?? {}) };
  await db
    .insert(organizationAiSettings)
    .values({ organizationId: input.organizationId, ...values })
    .onConflictDoUpdate({ target: organizationAiSettings.organizationId, set: values });

  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: keyFields ? "ai_settings.key_set" : "ai_settings.mode_changed",
    targetType: "organization",
    targetId: input.organizationId,
    // Nie der Schlüssel, auch nicht Teile davon.
    metadata: { mode: input.mode, keyReplaced: Boolean(keyFields) },
  }).catch(logAuditFailure);
  return getAiSettings(input.organizationId);
}

/** Entfernt den gespeicherten eigenen Schlüssel. War `byok` eingestellt, ist danach kein KI-Zugang mehr eingerichtet. */
export async function removeAiKey(organizationId: string, actorUserId: string): Promise<boolean> {
  const [row] = await getDb()
    .update(organizationAiSettings)
    .set({ keyEncrypted: null, keyLast4: null, keyUpdatedAt: null, updatedByUserId: actorUserId, updatedAt: new Date() })
    .where(eq(organizationAiSettings.organizationId, organizationId))
    .returning({ mode: organizationAiSettings.mode });
  if (!row) return false;
  if (row.mode === "byok") {
    await getDb().update(organizationAiSettings).set({ mode: null }).where(eq(organizationAiSettings.organizationId, organizationId));
  }
  await recordAuditEvent({
    actorUserId,
    action: "ai_settings.key_removed",
    targetType: "organization",
    targetId: organizationId,
    metadata: {},
  }).catch(logAuditFailure);
  return true;
}

export type AiAccess =
  | { kind: "platform" }
  | { kind: "byok"; apiKey: string }
  | { kind: "none"; reason: "not_configured" | "key_missing" | "key_unreadable" };

/**
 * Für den KI-Schritt der internen Lernpfade: mit welchem Zugang darf diese Firma generieren? Liefert den
 * entschlüsselten Schlüssel NUR serverseitig an den Aufrufer, der ihn für genau einen Aufruf verwendet. Nie
 * protokollieren, nie an den Browser geben.
 */
export async function resolveAiAccess(organizationId: string): Promise<AiAccess> {
  const [row] = await getDb().select().from(organizationAiSettings).where(eq(organizationAiSettings.organizationId, organizationId)).limit(1);
  if (!row?.mode) return { kind: "none", reason: "not_configured" };
  if (row.mode === "platform") return { kind: "platform" };
  if (!row.keyEncrypted) return { kind: "none", reason: "key_missing" };
  try {
    return { kind: "byok", apiKey: decryptSecret(row.keyEncrypted) };
  } catch {
    return { kind: "none", reason: "key_unreadable" };
  }
}
