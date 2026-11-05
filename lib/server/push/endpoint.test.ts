import { afterEach, describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./endpoint";

describe("Web Push: erlaubte Adressen (Schutz vor SSRF)", () => {
  afterEach(() => {
    delete process.env.PUSH_ALLOWED_HOSTS;
  });

  it("die Dienste der großen Browser sind erlaubt", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QAbc")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=abc")).toBe(true);
  });

  it("alles andere nicht: interne Adressen, Metadatendienst, fremde Hosts, ähnliche Namen", () => {
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc", // kein https
      "https://localhost/push",
      "https://127.0.0.1/push",
      "https://169.254.169.254/latest/meta-data",
      "https://postgres:5432/",
      "https://evil.example/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.example/x",
      "https://notfcm.googleapis.com/x".replace("notfcm", "xfcm") + "evil", // „xfcm.googleapis.comevil“
      "https://user:pw@fcm.googleapis.com/x", // Zugangsdaten in der Adresse
      "https://fcm.googleapis.com:8443/x", // fremder Port
      "javascript:alert(1)",
      "nicht-eine-adresse",
      `https://fcm.googleapis.com/${"a".repeat(1100)}`, // zu lang
    ]) {
      expect(isAllowedPushEndpoint(bad), bad).toBe(false);
    }
  });

  it("PUSH_ALLOWED_HOSTS erweitert die Liste um genau die genannten Hosts", () => {
    expect(isAllowedPushEndpoint("https://push.example.org/x")).toBe(false);
    process.env.PUSH_ALLOWED_HOSTS = " push.example.org , other.example.net ";
    expect(isAllowedPushEndpoint("https://push.example.org/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://a.other.example.net/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://example.org/x")).toBe(false);
  });
});
