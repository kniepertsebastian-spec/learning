import { describe, expect, it } from "vitest";
import {
  checkAccountActionRateLimit,
  checkAccountExportRateLimit,
  checkInvitationAcceptRateLimit,
  checkInvitationCreateRateLimit,
  checkLoginRateLimit,
  checkRegistrationRateLimit,
  clientIp,
} from "./auth-rate-limit";

describe("auth rate limits", () => {
  it("sperrt Login nach 10 Versuchen je E-Mail, auch bei wechselnder IP", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkLoginRateLimit(`10.0.0.${i}`, "a@example.com").allowed).toBe(true);
    }
    expect(checkLoginRateLimit("10.0.1.1", "a@example.com").allowed).toBe(false);
    expect(checkLoginRateLimit("10.0.1.1", "b@example.com").allowed).toBe(true);
  });

  it("sperrt Login nach 30 Versuchen je IP, auch bei wechselnden Konten", () => {
    for (let i = 0; i < 30; i++) {
      expect(checkLoginRateLimit("1.1.1.1", `user${i}@example.com`).allowed).toBe(true);
    }
    expect(checkLoginRateLimit("1.1.1.1", "another@example.com").allowed).toBe(false);
    expect(checkLoginRateLimit("9.9.9.9", "another@example.com").allowed).toBe(true);
  });

  it("der E2E-Faktor lockert nur die Login-Limits und nur wenn gesetzt", () => {
    process.env.LOGIN_RATE_LIMIT_FACTOR = "5";
    try {
      for (let i = 0; i < 50; i++) expect(checkLoginRateLimit(`20.0.0.${i}`, "factor@example.com").allowed).toBe(true);
      expect(checkLoginRateLimit("20.0.1.1", "factor@example.com").allowed).toBe(false);
    } finally {
      delete process.env.LOGIN_RATE_LIMIT_FACTOR;
    }
    process.env.LOGIN_RATE_LIMIT_FACTOR = "abc"; // ungültig: Standard
    try {
      for (let i = 0; i < 10; i++) checkLoginRateLimit(`21.0.0.${i}`, "bad@example.com");
      expect(checkLoginRateLimit("21.0.1.1", "bad@example.com").allowed).toBe(false);
    } finally {
      delete process.env.LOGIN_RATE_LIMIT_FACTOR;
    }
  });

  it("sperrt Registrierung nach 5 Versuchen je IP", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRegistrationRateLimit("2.2.2.2").allowed).toBe(true);
    }
    expect(checkRegistrationRateLimit("2.2.2.2").allowed).toBe(false);
  });

  it("liest die Client-IP in Prioritätsreihenfolge", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }))).toBe("3.3.3.3");
    expect(
      clientIp(new Headers({ "cf-connecting-ip": "5.5.5.5", "x-forwarded-for": "3.3.3.3" })),
    ).toBe("5.5.5.5");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("invitation rate limits", () => {
  it("begrenzt das Anlegen auf 20 pro Stunde und Admin", () => {
    for (let i = 0; i < 20; i++) {
      expect(checkInvitationCreateRateLimit("admin-x").allowed).toBe(true);
    }
    expect(checkInvitationCreateRateLimit("admin-x").allowed).toBe(false);
    expect(checkInvitationCreateRateLimit("admin-y").allowed).toBe(true);
  });

  it("begrenzt das Annehmen auf 10 pro 15 Minuten und Nutzer", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkInvitationAcceptRateLimit("user-x").allowed).toBe(true);
    }
    expect(checkInvitationAcceptRateLimit("user-x").allowed).toBe(false);
    expect(checkInvitationAcceptRateLimit("user-y").allowed).toBe(true);
  });
});

describe("account rate limits", () => {
  it("begrenzt Passwortwechsel und Löschen auf 10 Versuche je 15 Minuten und Nutzer", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkAccountActionRateLimit("acct-x").allowed).toBe(true);
    }
    expect(checkAccountActionRateLimit("acct-x").allowed).toBe(false);
    expect(checkAccountActionRateLimit("acct-y").allowed).toBe(true);
  });

  it("begrenzt den Datenexport auf 5 pro Stunde und Nutzer", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkAccountExportRateLimit("exp-x").allowed).toBe(true);
    }
    expect(checkAccountExportRateLimit("exp-x").allowed).toBe(false);
    expect(checkAccountExportRateLimit("exp-y").allowed).toBe(true);
  });
});
