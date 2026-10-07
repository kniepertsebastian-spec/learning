import { describe, expect, it } from "vitest";
import { inspectImage, MAX_IMAGE_BYTES } from "./images";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16)]);

describe("Screenshot-Prüfung", () => {
  it("nimmt PNG, JPEG und WebP an (auch ohne oder mit allgemeinem MIME-Typ)", () => {
    expect(inspectImage({ filename: "a.png", mimeType: "image/png", data: PNG })).toEqual({ ok: true, mimeType: "image/png" });
    expect(inspectImage({ filename: "a.JPG", mimeType: "", data: JPG })).toEqual({ ok: true, mimeType: "image/jpeg" });
    expect(inspectImage({ filename: "a.jpeg", mimeType: "application/octet-stream", data: JPG })).toMatchObject({ ok: true });
    expect(inspectImage({ filename: "a.webp", mimeType: "image/webp", data: WEBP })).toMatchObject({ ok: true });
  });
  it("lehnt leere, zu große, falsche Typen und getarnte Dateien ab", () => {
    expect(inspectImage({ filename: "a.png", mimeType: "image/png", data: Buffer.alloc(0) })).toMatchObject({ code: "empty" });
    expect(inspectImage({ filename: "a.png", mimeType: "image/png", data: Buffer.alloc(MAX_IMAGE_BYTES + 1) })).toMatchObject({ code: "too_large" });
    expect(inspectImage({ filename: "a.svg", mimeType: "image/svg+xml", data: Buffer.from("<svg onload=alert(1)/>") })).toMatchObject({ code: "unsupported_type" });
    expect(inspectImage({ filename: "a.png", mimeType: "image/jpeg", data: PNG })).toMatchObject({ code: "unsupported_type" });
    expect(inspectImage({ filename: "a.png", mimeType: "image/png", data: Buffer.from("<html>kein Bild</html>") })).toMatchObject({ code: "invalid_content" });
    expect(inspectImage({ filename: "a.png", mimeType: "image/png", data: JPG })).toMatchObject({ code: "invalid_content" });
  });
});
