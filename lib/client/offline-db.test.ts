import { describe, expect, it } from "vitest";
import { isQuotaExceededError, OfflineQuotaExceededError } from "./offline-db";

describe("isQuotaExceededError", () => {
  it("erkennt die Standard-DOMException", () => {
    expect(isQuotaExceededError(new DOMException("voll", "QuotaExceededError"))).toBe(true);
  });

  it("erkennt Legacy-Safari (QUOTA_EXCEEDED_ERR) und Firefox (NS_ERROR_DOM_QUOTA_REACHED)", () => {
    expect(isQuotaExceededError({ name: "QUOTA_EXCEEDED_ERR", code: 22 })).toBe(true);
    expect(isQuotaExceededError({ name: "NS_ERROR_DOM_QUOTA_REACHED", code: 1014 })).toBe(true);
  });

  it("erkennt Code 22 ohne Namen (alte WebKit-Fehlerobjekte)", () => {
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
  });

  it("erkennt den eigenen typisierten Fehler", () => {
    const error = new OfflineQuotaExceededError({ cause: new DOMException("voll", "QuotaExceededError") });
    expect(isQuotaExceededError(error)).toBe(true);
    expect(error.code).toBe("QUOTA_EXCEEDED");
  });

  it("wertet andere Fehler nicht als Speichermangel", () => {
    expect(isQuotaExceededError(new DOMException("weg", "AbortError"))).toBe(false);
    expect(isQuotaExceededError(new Error("Netzwerkfehler"))).toBe(false);
    expect(isQuotaExceededError({ name: "Error", code: 22 })).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError("QuotaExceededError")).toBe(false);
  });
});
