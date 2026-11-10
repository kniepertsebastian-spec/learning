import { describe, expect, it } from "vitest";
import { MAX_EMAIL_LENGTH } from "./email";
import { parseLoginCredentials } from "./login-input";

describe("parseLoginCredentials", () => {
  it("normalisiert die E-Mail und lässt das Passwort unverändert", () => {
    expect(parseLoginCredentials({ email: "  Anna@Example.COM ", password: " geheim " })).toEqual({
      email: "anna@example.com",
      password: " geheim ",
    });
  });

  it("lehnt fehlende oder nicht-textuelle Felder ab", () => {
    expect(parseLoginCredentials(undefined)).toBeNull();
    expect(parseLoginCredentials({})).toBeNull();
    expect(parseLoginCredentials({ email: "a@example.com" })).toBeNull();
    expect(parseLoginCredentials({ password: "x" })).toBeNull();
    expect(parseLoginCredentials({ email: "   ", password: "x" })).toBeNull();
    expect(parseLoginCredentials({ email: "a@example.com", password: "" })).toBeNull();
    expect(parseLoginCredentials({ email: ["a@example.com"], password: "x" })).toBeNull();
    expect(parseLoginCredentials({ email: "a@example.com", password: 123 })).toBeNull();
  });

  it("akzeptiert eine E-Mail mit genau 254 Zeichen und lehnt längere ab", () => {
    const local = "a".repeat(MAX_EMAIL_LENGTH - "@example.com".length);
    expect(parseLoginCredentials({ email: `${local}@example.com`, password: "x" })).not.toBeNull();
    expect(parseLoginCredentials({ email: `${local}a@example.com`, password: "x" })).toBeNull();
    expect(parseLoginCredentials({ email: "a".repeat(1_000_000) + "@example.com", password: "x" })).toBeNull();
  });

  it("prüft die Länge nach dem Kürzen von Leerraum und dem Kleinschreiben", () => {
    const local = "A".repeat(MAX_EMAIL_LENGTH - "@example.com".length);
    expect(parseLoginCredentials({ email: `   ${local}@example.com   `, password: "x" })).not.toBeNull();
  });
});
