import { describe, expect, it } from "vitest";
import { MAX_PASSWORD_BYTES, newPasswordSchema, passwordProblems } from "./password-policy";

describe("passwordProblems", () => {
  it("accepts a password with 8+ characters, upper and lower case and a special character", () => {
    expect(passwordProblems("Abcdef-g")).toEqual([]);
    expect(passwordProblems("Sehr-sicheres-Passwort-1")).toEqual([]);
  });

  it("does not demand a digit", () => {
    expect(passwordProblems("Passwort!")).toEqual([]);
  });

  it("names every missing part", () => {
    expect(passwordProblems("kurz")).toEqual([
      "Das Passwort muss mindestens 8 Zeichen lang sein.",
      "Das Passwort braucht mindestens einen Großbuchstaben.",
      "Das Passwort braucht mindestens ein Sonderzeichen (z. B. ! ? # - _).",
    ]);
    expect(passwordProblems("abcdefgh!")).toEqual(["Das Passwort braucht mindestens einen Großbuchstaben."]);
    expect(passwordProblems("ABCDEFGH!")).toEqual(["Das Passwort braucht mindestens einen Kleinbuchstaben."]);
    expect(passwordProblems("Abcdefgh1")).toEqual(["Das Passwort braucht mindestens ein Sonderzeichen (z. B. ! ? # - _)."]);
  });

  it("does not count a space or a digit as a special character", () => {
    expect(passwordProblems("Abcdefg h")).toHaveLength(1);
    expect(passwordProblems("Abcdefg1")).toHaveLength(1);
  });

  it("handles umlauts as letters and any other symbol as special", () => {
    expect(passwordProblems("Äbcdefg€")).toEqual([]);
    expect(passwordProblems("äbcdefgh")).toContain("Das Passwort braucht mindestens einen Großbuchstaben.");
  });

  it("counts characters, not UTF-16 units, for the minimum", () => {
    // Seven characters, one of them outside the BMP (two UTF-16 units): still too short.
    expect(passwordProblems("Ab-cd😀e")).toContain("Das Passwort muss mindestens 8 Zeichen lang sein.");
  });

  it("rejects more than 72 bytes, which bcrypt would silently cut", () => {
    const tooLong = `Aa-${"x".repeat(MAX_PASSWORD_BYTES)}`;
    expect(passwordProblems(tooLong)).toEqual([`Das Passwort darf höchstens ${MAX_PASSWORD_BYTES} Byte lang sein.`]);
  });
});

describe("newPasswordSchema", () => {
  it("reports the first problem first, which is what the forms show", () => {
    const result = newPasswordSchema.safeParse("kurz");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Das Passwort muss mindestens 8 Zeichen lang sein.");
  });

  it("passes a valid password through unchanged", () => {
    expect(newPasswordSchema.parse("Gutes-Passwort-1")).toBe("Gutes-Passwort-1");
  });
});
