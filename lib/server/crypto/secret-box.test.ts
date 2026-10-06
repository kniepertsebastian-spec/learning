import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DecryptionFailedError, decryptSecret, encryptSecret, EncryptionNotConfiguredError, isEncryptionConfigured } from "./secret-box";

const keyEnv = () => ({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }) as unknown as NodeJS.ProcessEnv;

describe("Verschlüsselung kleiner Geheimnisse", () => {
  it("Rundlauf, auch mit Sonderzeichen und leer; der Klartext steht nicht im Ergebnis", () => {
    const env = keyEnv();
    for (const secret of ["AIzaSyExample-Key_123", "päßwörd mit Leerzeichen & Emoji 🔑", ""]) {
      const stored = encryptSecret(secret, env);
      expect(stored.startsWith("v1.")).toBe(true);
      if (secret) expect(stored).not.toContain(secret);
      expect(decryptSecret(stored, env)).toBe(secret);
    }
  });

  it("jedes Verschlüsseln liefert ein anderes Ergebnis (zufälliger Nonce)", () => {
    const env = keyEnv();
    expect(encryptSecret("gleich", env)).not.toBe(encryptSecret("gleich", env));
  });

  it("falscher Schlüssel und veränderte Werte werden erkannt", () => {
    const env = keyEnv();
    const stored = encryptSecret("geheim", env);
    expect(() => decryptSecret(stored, keyEnv())).toThrow(DecryptionFailedError);
    const [v, n, t, c] = stored.split(".");
    const flipped = c.length > 0 ? (c[0] === "A" ? "B" : "A") + c.slice(1) : c;
    expect(() => decryptSecret([v, n, t, flipped].join("."), env)).toThrow(DecryptionFailedError);
    expect(() => decryptSecret([v, n, "AAAA" + t.slice(4), c].join("."), env)).toThrow(DecryptionFailedError);
    for (const bad of ["", "unsinn", "v2.a.b.c", "v1.a.b", "v1.a.b.c.d"]) {
      expect(() => decryptSecret(bad, env), bad).toThrow(DecryptionFailedError);
    }
  });

  it("ohne oder mit falschem Schlüssel in der Umgebung: klare Konfigurationsfehler", () => {
    for (const env of [{}, { APP_ENCRYPTION_KEY: "" }, { APP_ENCRYPTION_KEY: Buffer.from("zu kurz").toString("base64") }] as unknown as NodeJS.ProcessEnv[]) {
      expect(isEncryptionConfigured(env)).toBe(false);
      expect(() => encryptSecret("x", env)).toThrow(EncryptionNotConfiguredError);
      expect(() => decryptSecret("v1.a.b.c", env)).toThrow(EncryptionNotConfiguredError);
    }
    expect(isEncryptionConfigured(keyEnv())).toBe(true);
  });
});
