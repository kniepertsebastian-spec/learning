/** Expertenprofil gegen echte DB (nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { certifications, courseApprovals, reviewerCertifications, reviewerQualifications, users } from "@/lib/server/db/schema";
import type { MailMessage } from "@/lib/server/mail/mailer";
import { seedUser } from "@/lib/server/psrp/test-db";
import { deleteCertification, getOwnProfile, getPublicProfile, ProfileError, publicIdentities, publishProfile, runCertificateReminders, saveCertification, saveExperience, saveProfile, setCertificationVerified, withdrawProfile } from "./profile-service";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 6);

async function reviewer() {
  const id = await seedUser();
  await getDb().update(users).set({ role: "reviewer" }).where(eq(users.id, id));
  await getDb().insert(reviewerQualifications).values({ userId: id, source: "admin" }); // Veröffentlichen setzt Freigaberechte voraus
  return id;
}
const base = (over: Record<string, unknown> = {}) => ({ firstName: "Éva", lastName: `Müller${tag}`, country: "Deutschland", region: "Bayern", bio: { de: "Hallo", en: "Hi" }, linkedinUrl: null, consent: { name: true, country: true }, ...over });
const cert = (over: Record<string, unknown> = {}) => ({ vendor: "CompTIA", name: "Security+", earnedOn: "2024-01-10", validUntil: "2027-01-10", verificationUrl: "https://verify.example.com/abc", isPublic: true, ...over });

run("Expertenprofil (echte DB)", () => {
  it("Profil anlegen: lesbare, eindeutige Adresse; falsche Eingaben werden abgelehnt", async () => {
    const a = await reviewer();
    const b = await reviewer();
    await saveProfile(a, base());
    await saveProfile(b, base());
    const [pa, pb] = [await getOwnProfile(a), await getOwnProfile(b)];
    expect(pa.profile!.slug).toBe(`eva-mueller${tag}`);
    expect(pb.profile!.slug).toBe(`eva-mueller${tag}-2`);
    await expect(saveProfile(a, base({ firstName: " " }))).rejects.toBeInstanceOf(ProfileError);
    await expect(saveProfile(a, base({ linkedinUrl: "https://example.com/x" }))).rejects.toBeInstanceOf(ProfileError);
    await expect(saveProfile(a, base({ linkedinUrl: "javascript:alert(1)" }))).rejects.toBeInstanceOf(ProfileError);
    // Die Adresse bleibt stabil, auch wenn sich der Name ändert
    await saveProfile(a, base({ lastName: "Neu" }));
    expect((await getOwnProfile(a)).profile!.slug).toBe(`eva-mueller${tag}`);
  });

  it("Veröffentlichen nur mit Einwilligung und Eintrag; öffentlich ist genau das Freigegebene; Rückzug sofort", async () => {
    const id = await reviewer();
    await saveProfile(id, base({ consent: {} }));
    await expect(publishProfile(id)).rejects.toMatchObject({ problems: expect.arrayContaining([expect.stringContaining("Name")]) });
    await saveProfile(id, base({ consent: { name: true, country: true, bio: false, region: false } }));
    await expect(publishProfile(id)).rejects.toBeInstanceOf(ProfileError); // noch kein öffentlicher Eintrag
    await saveExperience(id, { kind: "job", title: "Admin", organization: "ACME", periodFrom: "2019", periodTo: null, isPublic: true });
    await saveExperience(id, { kind: "project", title: "Geheimes Projekt", periodFrom: "2021", isPublic: false });
    const slug = (await getOwnProfile(id)).profile!.slug;
    expect(await getPublicProfile(slug)).toBeNull(); // noch nicht veröffentlicht

    await publishProfile(id);
    const pub = (await getPublicProfile(slug))!;
    expect(pub.profile).toMatchObject({ country: "Deutschland", region: null, bio: null, indexable: false });
    expect(pub.profile.experience.map((e) => e.title)).toEqual(["Admin"]);
    expect(JSON.stringify(pub)).not.toContain("Geheimes Projekt");
    expect((await publicIdentities([id])).get(id)).toMatchObject({ slug });

    // Ein veröffentlichtes Profil darf nicht unvollständig werden
    await expect(saveProfile(id, base({ consent: { name: false } }))).rejects.toBeInstanceOf(ProfileError);
    const exp = (await getOwnProfile(id)).experience.find((e) => e.isPublic)!;
    await expect(saveExperience(id, { kind: "job", title: "Admin", periodFrom: "2019", isPublic: false }, exp.id)).rejects.toBeInstanceOf(ProfileError);

    await withdrawProfile(id);
    expect(await getPublicProfile(slug)).toBeNull();
    expect((await publicIdentities([id])).size).toBe(0);
    const after = await getOwnProfile(id);
    expect(after.profile!.consent).toEqual({});
    expect(after.experience.every((e) => !e.isPublic)).toBe(true);
  });

  it("Zertifikate: nur https-Links, Prüfung durch Admin, Linkänderung entzieht die Prüfung", async () => {
    const id = await reviewer();
    const admin = await seedUser();
    await expect(saveCertification(id, cert())).rejects.toBeInstanceOf(ProfileError); // ohne Profil
    await saveProfile(id, base());
    await expect(saveCertification(id, cert({ verificationUrl: "http://verify.example.com" }))).rejects.toBeInstanceOf(ProfileError);
    await expect(saveCertification(id, cert({ earnedOn: "2024-02-31" }))).rejects.toBeInstanceOf(ProfileError);
    await expect(saveCertification(id, cert({ validUntil: "2020-01-01" }))).rejects.toBeInstanceOf(ProfileError);
    const certId = await saveCertification(id, cert());
    expect(await setCertificationVerified(admin, certId, true)).toBe(true);
    expect((await getOwnProfile(id)).certifications[0].verifiedAt).toBeTruthy();
    await saveCertification(id, cert({ name: "Security+ 701" }), certId); // gleicher Link: bleibt geprüft
    expect((await getOwnProfile(id)).certifications[0].verifiedAt).toBeTruthy();
    await saveCertification(id, cert({ verificationUrl: "https://verify.example.com/neu" }), certId);
    expect((await getOwnProfile(id)).certifications[0].verifiedAt).toBeNull();
    expect(await setCertificationVerified(admin, randomUUID(), true)).toBe(false);
    expect(await deleteCertification(id, certId)).toBe(true);
    expect(await deleteCertification(id, certId)).toBe(false);
  });

  it("fremde Einträge lassen sich nicht ändern", async () => {
    const a = await reviewer();
    const b = await reviewer();
    await saveProfile(a, base());
    await saveProfile(b, base());
    const id = await saveCertification(a, cert());
    await expect(saveCertification(b, cert(), id)).rejects.toBeInstanceOf(ProfileError);
    expect(await deleteCertification(b, id)).toBe(false);
    const exp = await saveExperience(a, { kind: "job", title: "X", periodFrom: "2020", isPublic: false });
    await expect(saveExperience(b, { kind: "job", title: "Y", periodFrom: "2020", isPublic: false }, exp)).rejects.toBeInstanceOf(ProfileError);
  });

  it("geprüfte Kurse: nur Kataloge, jeweils der neueste Stand", async () => {
    const id = await reviewer();
    await saveProfile(id, base());
    const db = getDb();
    const [c] = await db.insert(certifications).values({ slug: `exp-${tag}-${randomUUID().slice(0, 4)}`, name: "Kurs A", provider: "T", examName: "T", examVersion: "1", catalogStatus: "approved" }).returning({ id: certifications.id });
    const [draft] = await db.insert(certifications).values({ slug: `exp-d-${tag}-${randomUUID().slice(0, 4)}`, name: "Kurs Entwurf", provider: "T", examName: "T", examVersion: "1", catalogStatus: "draft" }).returning({ id: certifications.id });
    const approval = (certId: string, version: string, at: string) => ({ certificationId: certId, reviewerUserId: id, reviewerDisplayName: "Éva", contentHash: "h", fingerprints: { sections: {}, questions: {} }, versionLabel: version, approvedAt: new Date(at) });
    await db.insert(courseApprovals).values([approval(c.id, "1.0", "2026-01-01"), approval(c.id, "2.0", "2026-06-01"), approval(draft.id, "1.0", "2026-02-01")]);
    await saveExperience(id, { kind: "job", title: "Admin", periodFrom: "2019", isPublic: true });
    await publishProfile(id);
    const slug = (await getOwnProfile(id)).profile!.slug;
    const pub = (await getPublicProfile(slug))!;
    expect(pub.courses.map((x) => `${x.name} ${x.versionLabel}`)).toEqual(["Kurs A 2.0"]);
    await db.delete(certifications).where(eq(certifications.id, draft.id));
    await db.delete(certifications).where(eq(certifications.id, c.id));
  });

  it("Erinnerung 60 Tage vor Ablauf: Person und Admins, einmal je Ablaufdatum", async () => {
    const id = await reviewer();
    await saveProfile(id, base());
    const now = new Date("2026-10-24T08:00:00Z");
    const soon = await saveCertification(id, cert({ name: `Bald ${tag}`, validUntil: "2026-12-10" }));
    await saveCertification(id, cert({ name: `Fern ${tag}`, validUntil: "2028-01-01" }));
    const sent: MailMessage[] = [];
    const send = async (m: MailMessage) => {
      sent.push(m);
      return true;
    };
    const first = await runCertificateReminders(now, send);
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const mine = sent.filter((m) => m.subject.includes(`Bald ${tag}`));
    expect(mine.length).toBeGreaterThanOrEqual(2); // Person + mindestens ein Admin
    expect(sent.some((m) => m.subject.includes(`Fern ${tag}`))).toBe(false);
    const again: MailMessage[] = [];
    await runCertificateReminders(now, async (m) => (again.push(m), true));
    expect(again.some((m) => m.subject.includes(`Bald ${tag}`))).toBe(false);
    // Neues Ablaufdatum: Erinnerung gilt neu
    await saveCertification(id, cert({ name: `Bald ${tag}`, validUntil: "2026-12-20" }), soon);
    const [row] = await getDb().select().from(reviewerCertifications).where(eq(reviewerCertifications.id, soon));
    expect(row.remindersSent).toEqual({});
  });

  it("Kontolöschung: Profil, Erfahrung und Zertifikate verschwinden, die Seite ist nicht mehr erreichbar", async () => {
    const id = await reviewer();
    await saveProfile(id, base());
    await saveCertification(id, cert());
    await publishProfile(id);
    const slug = (await getOwnProfile(id)).profile!.slug;
    expect(await getPublicProfile(slug)).not.toBeNull();
    await getDb().delete(users).where(eq(users.id, id));
    expect(await getPublicProfile(slug)).toBeNull();
    expect((await getDb().select().from(reviewerCertifications).where(eq(reviewerCertifications.userId, id))).length).toBe(0);
  });
});
