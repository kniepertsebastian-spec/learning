import { describe, expect, it, vi } from "vitest";
import type { LearningProfilePayload } from "@/lib/server/db/schema";
import { payloadHash, signProfile, verificationCode, verifyProfile } from "./sign";

const payload: LearningProfilePayload = {
  holder: "Erika Beispiel",
  courses: [{ course: "Network+", certificate: "CompTIA Network+", vendor: "CompTIA", earnedAt: "2026-03-01T00:00:00.000Z", expiresAt: null, chaptersCompleted: 5, chaptersTotal: 5, lessonsDone: 20, lessonsTotal: 20 }],
};
const base = { id: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", issuedAt: new Date("2026-10-25T12:00:00Z"), payload };
const secret = "geheimnis";

describe("Lernprofil-PDF: Signatur", () => {
  it("dieselben Angaben ergeben dieselbe Signatur, auch bei anderer Schlüsselreihenfolge", () => {
    const a = signProfile(base, secret);
    expect(signProfile({ ...base, payload: { courses: payload.courses, holder: payload.holder } }, secret)).toBe(a);
    expect(payloadHash(payload)).toBe(payloadHash({ courses: payload.courses, holder: payload.holder }));
  });
  it("jede Änderung am Inhalt, an der Person, der Kennung oder dem Datum macht die Signatur ungültig", () => {
    const signature = signProfile(base, secret);
    expect(verifyProfile({ ...base, signature }, secret)).toBe(true);
    expect(verifyProfile({ ...base, signature, payload: { ...payload, holder: "Max Muster" } }, secret)).toBe(false);
    expect(verifyProfile({ ...base, signature, payload: { ...payload, courses: [{ ...payload.courses[0], course: "Security+" }] } }, secret)).toBe(false);
    expect(verifyProfile({ ...base, signature, payload: { ...payload, courses: [{ ...payload.courses[0], earnedAt: "2026-04-01T00:00:00.000Z" }] } }, secret)).toBe(false);
    expect(verifyProfile({ ...base, signature, userId: "33333333-3333-4333-8333-333333333333" }, secret)).toBe(false);
    expect(verifyProfile({ ...base, signature, id: "44444444-4444-4444-8444-444444444444" }, secret)).toBe(false);
    expect(verifyProfile({ ...base, signature, issuedAt: new Date("2026-10-26T12:00:00Z") }, secret)).toBe(false);
  });
  it("ohne den Schlüssel oder mit einem anderen lässt sich keine gültige Signatur erzeugen", () => {
    const signature = signProfile(base, secret);
    expect(verifyProfile({ ...base, signature }, "anderes-geheimnis")).toBe(false);
    expect(verifyProfile({ ...base, signature: "x" }, secret)).toBe(false);
    // Ohne Schlüssel (auch nicht aus der Umgebung) gibt es weder Signatur noch Bestätigung.
    vi.stubEnv("AUTH_SECRET", "");
    try {
      expect(verifyProfile({ ...base, signature }, undefined)).toBe(false);
      expect(() => signProfile(base, undefined)).toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("Prüfcode: 20 Zeichen in Vierergruppen", () => {
    expect(verificationCode(signProfile(base, secret))).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$/);
  });
});
