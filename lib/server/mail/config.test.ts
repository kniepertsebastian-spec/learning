import { describe, expect, it } from "vitest";
import { appUrl, getMailConfig } from "./config";

const base: NodeJS.ProcessEnv = {
  MAIL_SMTP_HOST: "smtp.gmail.com",
  MAIL_SMTP_USER: "me@gmail.com",
  MAIL_SMTP_PASSWORD: "app-passwort",
  MAIL_FROM: "Learning <me@gmail.com>",
  APP_BASE_URL: "https://learning.pwa-tree.de",
} as unknown as NodeJS.ProcessEnv;

describe("getMailConfig", () => {
  it("ist ohne vollständige Angaben AUS (null)", () => {
    expect(getMailConfig({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    for (const key of Object.keys(base)) {
      const env = { ...base };
      delete env[key];
      expect(getMailConfig(env), `ohne ${key}`).toBeNull();
    }
  });

  it("Gmail-Standard: Port 465 mit implizitem TLS, Absender und Basis-URL ohne Pfad", () => {
    expect(getMailConfig({ ...base, APP_BASE_URL: "https://learning.pwa-tree.de/irgendwas" })).toMatchObject({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      requireTLS: false,
      user: "me@gmail.com",
      from: "Learning <me@gmail.com>",
      baseUrl: "https://learning.pwa-tree.de",
    });
  });

  it("Port 587 erzwingt STARTTLS", () => {
    expect(getMailConfig({ ...base, MAIL_SMTP_PORT: "587" })).toMatchObject({ secure: false, requireTLS: true });
  });

  it("MAIL_SMTP_SECURE überschreibt die Port-Regel (implizites TLS auf anderen Ports und umgekehrt)", () => {
    expect(getMailConfig({ ...base, MAIL_SMTP_PORT: "2465", MAIL_SMTP_SECURE: "1" })).toMatchObject({ secure: true, requireTLS: false });
    expect(getMailConfig({ ...base, MAIL_SMTP_PORT: "465", MAIL_SMTP_SECURE: "0" })).toMatchObject({ secure: false, requireTLS: true });
    expect(getMailConfig({ ...base, MAIL_SMTP_PORT: "2465" })).toMatchObject({ secure: false, requireTLS: true }); // ohne Angabe: Port-Regel
  });

  it("lehnt ungültige Ports und Basis-URLs ab", () => {
    for (const port of ["0", "70000", "abc", "46.5"]) {
      expect(getMailConfig({ ...base, MAIL_SMTP_PORT: port }), port).toBeNull();
    }
    for (const url of ["learning.pwa-tree.de", "ftp://x.de", "javascript:alert(1)"]) {
      expect(getMailConfig({ ...base, APP_BASE_URL: url }), url).toBeNull();
    }
  });

  it("Produktion: nur https-Links, nie unverschlüsseltes SMTP", () => {
    const prod = { ...base, NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
    expect(getMailConfig({ ...prod, APP_BASE_URL: "http://learning.pwa-tree.de" })).toBeNull();
    // MAIL_SMTP_INSECURE wird in Produktion ignoriert: bei 587 bleibt STARTTLS Pflicht
    expect(getMailConfig({ ...prod, MAIL_SMTP_PORT: "587", MAIL_SMTP_INSECURE: "1" })).toMatchObject({ requireTLS: true });
  });

  it("außerhalb von Produktion erlaubt MAIL_SMTP_INSECURE=1 unverschlüsseltes SMTP und http-Links", () => {
    const dev = { ...base, MAIL_SMTP_PORT: "2525", MAIL_SMTP_INSECURE: "1", APP_BASE_URL: "http://localhost:3000" } as unknown as NodeJS.ProcessEnv;
    expect(getMailConfig(dev)).toMatchObject({ requireTLS: false, baseUrl: "http://localhost:3000" });
  });
});

describe("appUrl", () => {
  it("baut absolute Links und verlangt eine Konfiguration", () => {
    const config = getMailConfig(base)!;
    expect(appUrl("/verify-email/abc", config)).toBe("https://learning.pwa-tree.de/verify-email/abc");
    expect(appUrl("reset-password/x", config)).toBe("https://learning.pwa-tree.de/reset-password/x");
    expect(() => appUrl("/x", null)).toThrow();
  });
});
