import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./vapid-key";

describe("VAPID-Schlüssel im Browser", () => {
  it("base64url mit und ohne Auffüllung ergibt dieselben Bytes", () => {
    // „hello?>“ in base64: aGVsbG8/Pg==  → base64url: aGVsbG8_Pg
    const expected = [...Buffer.from("hello?>")];
    expect([...urlBase64ToUint8Array("aGVsbG8_Pg")]).toEqual(expected);
    expect([...urlBase64ToUint8Array("aGVsbG8_Pg==")]).toEqual(expected);
  });

  it("ein echter Schlüssel hat 65 Bytes und beginnt mit 0x04 (unkomprimierter Punkt)", async () => {
    const webpush = await import("web-push");
    const { publicKey } = webpush.generateVAPIDKeys();
    const bytes = urlBase64ToUint8Array(publicKey);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});
