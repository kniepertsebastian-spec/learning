import { describe, expect, it } from "vitest";
import { checkLoginRateLimit, checkRegistrationRateLimit, clientIp } from "./auth-rate-limit";

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
