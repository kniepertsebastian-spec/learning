import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Verschlüsselt kleine Geheimnisse (z. B. den KI-Schlüssel einer Firma) für die Ablage in der Datenbank:
 * AES-256-GCM mit zufälligem Nonce je Wert. Der Schlüssel kommt aus `APP_ENCRYPTION_KEY` (32 Byte, base64,
 * z. B. `openssl rand -base64 32`) und liegt nie in der Datenbank. Ein Datenbank-Leak oder -Backup allein
 * verrät die Geheimnisse damit nicht; die Authentifizierung (GCM) erkennt veränderte Werte.
 *
 * Format: `v1.<nonce>.<tag>.<ciphertext>` (base64url). Das Präfix erlaubt später einen Wechsel des Verfahrens.
 * Geht der Schlüssel verloren, sind die gespeicherten Geheimnisse unbrauchbar und müssen neu eingegeben werden.
 */
export class EncryptionNotConfiguredError extends Error {}
export class DecryptionFailedError extends Error {}

const VERSION = "v1";

function loadKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) throw new EncryptionNotConfiguredError("APP_ENCRYPTION_KEY ist nicht gesetzt.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new EncryptionNotConfiguredError("APP_ENCRYPTION_KEY muss 32 Byte (base64) lang sein.");
  return key;
}

export function isEncryptionConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    loadKey(env);
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = loadKey(env);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, nonce.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(stored: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = loadKey(env);
  const [version, nonce, tag, ciphertext, ...rest] = stored.split(".");
  if (version !== VERSION || !nonce || !tag || ciphertext === undefined || rest.length > 0) {
    throw new DecryptionFailedError("Unbekanntes Format.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // Falscher Schlüssel oder veränderter Wert: bewusst keine Details.
    throw new DecryptionFailedError("Entschlüsselung fehlgeschlagen.");
  }
}
