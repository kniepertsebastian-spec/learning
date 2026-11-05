import { describe, expect, it } from "vitest";
import { MAX_PASSWORD_BYTES, newPasswordSchema, passwordProblems } from "./password-policy";

const NO_SPECIAL = "Das Passwort braucht mindestens ein Sonderzeichen (z. B. ! ? # - _).";
const NO_UPPER = "Das Passwort braucht mindestens einen Großbuchstaben.";
const NO_LOWER = "Das Passwort braucht mindestens einen Kleinbuchstaben.";
const NO_DIGIT = "Das Passwort braucht mindestens eine Ziffer.";
const TOO_SHORT = "Das Passwort muss mindestens 8 Zeichen lang sein.";

describe("passwordProblems", () => {
  it("accepts 8+ characters with upper case, lower case, a digit and a special character", () => {
    expect(passwordProblems("Abcdef-1")).toEqual([]);
    expect(passwordProblems("Sehr-sicheres-Passwort-1")).toEqual([]);
    expect(passwordProblems("E2e-Passw0rd!")).toEqual([]);
  });

  it("names every missing part", () => {
    expect(passwordProblems("kurz")).toEqual([TOO_SHORT, NO_UPPER, NO_DIGIT, NO_SPECIAL]);
    expect(passwordProblems("abcdefg1!")).toEqual([NO_UPPER]);
    expect(passwordProblems("ABCDEFG1!")).toEqual([NO_LOWER]);
    expect(passwordProblems("Abcdefgh!")).toEqual([NO_DIGIT]);
    expect(passwordProblems("Abcdefg12")).toEqual([NO_SPECIAL]);
  });

  it("demands a digit: a password without one is rejected", () => {
    expect(passwordProblems("Passwort!")).toEqual([NO_DIGIT]);
  });

  it("does not count a space as a special character or a digit as a letter", () => {
    expect(passwordProblems("Abcdef 1")).toEqual([NO_SPECIAL]);
    expect(passwordProblems("Abcdefg1")).toEqual([NO_SPECIAL]);
  });

  it("handles umlauts as letters and any other symbol as special", () => {
    expect(passwordProblems("Äbcdef1€")).toEqual([]);
    expect(passwordProblems("äbcdefg1!")).toContain(NO_UPPER);
  });

  it("counts characters, not UTF-16 units, for the minimum", () => {
    // Seven characters, one of them outside the BMP (two UTF-16 units): still too short.
    expect(passwordProblems("Ab-1d😀e")).toContain(TOO_SHORT);
  });

  it("rejects more than 72 bytes, which bcrypt would silently cut", () => {
    const tooLong = `Aa1-${"x".repeat(MAX_PASSWORD_BYTES)}`;
    expect(passwordProblems(tooLong)).toEqual([`Das Passwort darf höchstens ${MAX_PASSWORD_BYTES} Byte lang sein.`]);
  });
});

describe("newPasswordSchema", () => {
  it("reports the first problem first, which is what the forms show", () => {
    const result = newPasswordSchema.safeParse("kurz");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe(TOO_SHORT);
  });

  it("passes a valid password through unchanged", () => {
    expect(newPasswordSchema.parse("Gutes-Passwort-1")).toBe("Gutes-Passwort-1");
  });
});
