import { describe, expect, it } from "vitest";
import { applyConsent, certStatus, isIsoDate, isPeriod, needsExpiryReminder, placeLabel, publicView, publishProblems, safeHttpsUrl, safeLinkedinUrl, slugFromName, type CertificationData, type ExperienceData, type ProfileData } from "./profile";

const profile: ProfileData = { firstName: "Éva", lastName: "Müller", country: "Deutschland", region: "Bayern", bio: { de: "Hallo", en: "Hi" }, linkedinUrl: "https://www.linkedin.com/in/eva", consent: {} };
const exp = (isPublic: boolean): ExperienceData => ({ id: "e1", kind: "job", title: "Admin", organization: "ACME", periodFrom: "2019", periodTo: null, description: null, isPublic });
const cert = (over: Partial<CertificationData> = {}): CertificationData => ({ id: "c1", vendor: "CompTIA", name: "Security+", earnedOn: "2024-01-10", validUntil: "2027-01-10", verificationUrl: "https://verify.example.com/x", verifiedAt: null, isPublic: true, ...over });
const now = new Date("2026-10-24T10:00:00Z");

describe("Links und Eingaben", () => {
  it("nur https mit Host und ohne Zugangsdaten", () => {
    expect(safeHttpsUrl("https://verify.example.com/abc")).toBe("https://verify.example.com/abc");
    expect(safeHttpsUrl("http://verify.example.com")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("https://user:pw@example.com")).toBeNull();
    expect(safeHttpsUrl("https://localhost")).toBeNull();
    expect(safeHttpsUrl("")).toBeNull();
    expect(safeHttpsUrl(`https://example.com/${"a".repeat(600)}`)).toBeNull();
  });
  it("LinkedIn nur auf linkedin.com", () => {
    expect(safeLinkedinUrl("https://de.linkedin.com/in/x")).toBeTruthy();
    expect(safeLinkedinUrl("https://evil-linkedin.com/in/x")).toBeNull();
    expect(safeLinkedinUrl("https://example.com/linkedin.com")).toBeNull();
  });
  it("Zeiträume und Daten", () => {
    expect(isPeriod("2019")).toBe(true);
    expect(isPeriod("2019-04")).toBe(true);
    expect(isPeriod("2019-13")).toBe(false);
    expect(isPeriod("19")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-10")).toBe(true);
  });
  it("Slug aus Name", () => {
    expect(slugFromName("Éva", "Müller")).toBe("eva-mueller");
    expect(slugFromName("Jean-Luc", "O'Brien")).toBe("jean-luc-o-brien");
    expect(slugFromName("  ", "  ")).toBe("");
  });
});

describe("Einwilligung und Veröffentlichung", () => {
  it("neue Einwilligungen bekommen einen Zeitpunkt, alte behalten ihn, zurückgenommene fallen weg", () => {
    const first = applyConsent({}, { name: true, country: true, bio: true }, new Date("2026-10-01T00:00:00Z"));
    expect(Object.keys(first).sort()).toEqual(["bio", "country", "name"]);
    const second = applyConsent(first, { bio: false, region: true }, now);
    expect(second.name).toBe(first.name);
    expect(second.bio).toBeUndefined();
    expect(second.region).toBe(now.toISOString());
  });
  it("Veröffentlichen braucht Name, Land und einen öffentlichen Eintrag", () => {
    expect(publishProblems({ consent: {} }, [], [])).toHaveLength(3);
    expect(publishProblems({ consent: { name: "x", country: "x" } }, [exp(false)], [cert({ isPublic: false })])).toHaveLength(1);
    expect(publishProblems({ consent: { name: "x", country: "x" } }, [exp(true)], [])).toEqual([]);
    expect(publishProblems({ consent: { name: "x", country: "x" } }, [], [cert()])).toEqual([]);
  });
});

describe("Öffentliche Sicht", () => {
  const view = (consent: ProfileData["consent"], published = true, experience = [exp(true), { ...exp(false), id: "e2", title: "Geheim" }], certifications = [cert(), cert({ id: "c2", name: "Privat", isPublic: false })]) =>
    publicView({ slug: "eva-mueller", published, profile: { ...profile, consent }, experience, certifications, today: now });

  it("nichts, solange nicht veröffentlicht oder ohne Einwilligung für Name und Land", () => {
    expect(view({ name: "x", country: "x" }, false)).toBeNull();
    expect(view({ name: "x" })).toBeNull();
    expect(view({ country: "x" })).toBeNull();
  });
  it("nur eingewilligte Felder und öffentliche Einträge", () => {
    const v = view({ name: "x", country: "x" })!;
    expect(v).toMatchObject({ name: "Éva Müller", country: "Deutschland", region: null, bio: null, linkedinUrl: null, indexable: false });
    expect(v.experience.map((e) => e.title)).toEqual(["Admin"]);
    expect(v.certifications.map((c) => c.name)).toEqual(["Security+"]);
    const full = view({ name: "x", country: "x", region: "x", bio: "x", linkedin: "x", indexing: "x" })!;
    expect(full).toMatchObject({ region: "Bayern", bio: { de: "Hallo", en: "Hi" }, linkedinUrl: "https://www.linkedin.com/in/eva", indexable: true });
  });
  it("Nachweis ist erst nach Prüfung als geprüft markiert", () => {
    expect(view({ name: "x", country: "x" })!.certifications[0].verifiedAt).toBeNull();
    const verified = view({ name: "x", country: "x" }, true, [], [cert({ verifiedAt: new Date("2026-10-20T00:00:00Z") })])!;
    expect(verified.certifications[0].verifiedAt).toBe("2026-10-20T00:00:00.000Z");
  });
  it("Ort", () => {
    expect(placeLabel("Bayern", "Deutschland")).toBe("Bayern, Deutschland");
    expect(placeLabel(null, "Österreich")).toBe("Österreich");
  });
});

describe("Zertifikate: Ablauf und Erinnerung", () => {
  it("abgelaufen statt versteckt, bald ablaufend ab 60 Tagen vorher", () => {
    expect(certStatus(null, now)).toBe("valid");
    expect(certStatus("2027-06-01", now)).toBe("valid");
    expect(certStatus("2026-12-20", now)).toBe("expiring");
    expect(certStatus("2026-10-24", now)).toBe("expiring");
    expect(certStatus("2026-10-23", now)).toBe("expired");
  });
  it("Erinnerung einmal je Ablaufdatum, nicht für Abgelaufene oder Ferne", () => {
    expect(needsExpiryReminder({ validUntil: "2026-12-01", remindersSent: {} }, now)).toBe(true);
    expect(needsExpiryReminder({ validUntil: "2026-12-01", remindersSent: { d60: "2026-10-01" } }, now)).toBe(false);
    expect(needsExpiryReminder({ validUntil: "2026-10-01", remindersSent: {} }, now)).toBe(false);
    expect(needsExpiryReminder({ validUntil: "2028-01-01", remindersSent: {} }, now)).toBe(false);
    expect(needsExpiryReminder({ validUntil: null, remindersSent: {} }, now)).toBe(false);
  });
});
