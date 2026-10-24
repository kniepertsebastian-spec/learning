/**
 * Expertenprofil (roadmap_pruefer Phase 3): Self-Service für Prüfer, Nachweisprüfung durch Admins, öffentliche Sicht und Erinnerungen.
 * Öffentlich wird nur, was die Person einzeln freigegeben hat (Einwilligung je Feld und je Eintrag); `withdrawProfile` nimmt alles sofort zurück.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  courseApprovals,
  reviewerCertifications,
  reviewerExperience,
  reviewerProfiles,
  users,
  type ReviewerExperienceKind,
  type ReviewerProfileField,
} from "@/lib/server/db/schema";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { appUrl, isMailConfigured } from "@/lib/server/mail/config";
import { sendMail, type MailMessage } from "@/lib/server/mail/mailer";
import { reviewerCertificateExpiryMessage } from "@/lib/server/mail/templates";
import {
  applyConsent,
  EXPERIENCE_KINDS,
  isIsoDate,
  isPeriod,
  needsExpiryReminder,
  publicView,
  publishProblems,
  safeHttpsUrl,
  safeLinkedinUrl,
  slugFromName,
  type CertificationData,
  type ExperienceData,
  type ProfileData,
  type PublicProfile,
} from "@/lib/reviewers/profile";
import type { Localized } from "@/lib/types";

export class ProfileError extends Error {
  constructor(message: string, readonly problems: string[] = []) {
    super(message);
  }
}

const logAuditFailure = (err: unknown) => console.error("Audit-Log fehlgeschlagen:", err);
const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

/* ------------------------------------------------------------------ Lesen */

export interface OwnProfile {
  profile: (ProfileData & { slug: string; published: boolean; publishedAt: Date | null }) | null;
  experience: ExperienceData[];
  certifications: Array<CertificationData & { remindersSent: { d60?: string } }>;
}

export async function getOwnProfile(userId: string): Promise<OwnProfile> {
  const db = getDb();
  const [row] = await db.select().from(reviewerProfiles).where(eq(reviewerProfiles.userId, userId)).limit(1);
  const [experience, certs] = await Promise.all([
    db.select().from(reviewerExperience).where(eq(reviewerExperience.userId, userId)).orderBy(desc(reviewerExperience.periodFrom)),
    db.select().from(reviewerCertifications).where(eq(reviewerCertifications.userId, userId)).orderBy(asc(reviewerCertifications.vendor), asc(reviewerCertifications.name)),
  ]);
  return {
    profile: row
      ? { slug: row.slug, published: row.published, publishedAt: row.publishedAt, firstName: row.firstName, lastName: row.lastName, country: row.country, region: row.region, bio: row.bio, linkedinUrl: row.linkedinUrl, consent: row.consent }
      : null,
    experience: experience.map((e) => ({ id: e.id, kind: e.kind, title: e.title, organization: e.organization, periodFrom: e.periodFrom, periodTo: e.periodTo, description: e.description, isPublic: e.isPublic })),
    certifications: certs.map((c) => ({ id: c.id, vendor: c.vendor, name: c.name, earnedOn: c.earnedOn, validUntil: c.validUntil, verificationUrl: c.verificationUrl, verifiedAt: c.verifiedAt, isPublic: c.isPublic, remindersSent: c.remindersSent })),
  };
}

/* ------------------------------------------------------------------ Schreiben */

export interface ProfileInput {
  firstName: string;
  lastName: string;
  country: string;
  region?: string | null;
  bio?: Partial<Localized<string>> | null;
  linkedinUrl?: string | null;
  consent: Partial<Record<ReviewerProfileField, boolean>>;
}

async function freeSlug(base: string): Promise<string> {
  const db = getDb();
  const root = base || "experte";
  for (let n = 0; n < 200; n++) {
    const candidate = n === 0 ? root : `${root}-${n + 1}`;
    const [taken] = await db.select({ userId: reviewerProfiles.userId }).from(reviewerProfiles).where(eq(reviewerProfiles.slug, candidate)).limit(1);
    if (!taken) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/** Eigenes Profil anlegen oder ändern. Ist es veröffentlicht, darf die Änderung die Voraussetzungen nicht verletzen (sonst vorher zurückziehen). */
export async function saveProfile(userId: string, input: ProfileInput, now = new Date()): Promise<void> {
  const firstName = text(input.firstName, 80);
  const lastName = text(input.lastName, 80);
  const country = text(input.country, 80);
  if (!firstName || !lastName || !country) throw new ProfileError("Vorname, Name und Land sind Pflicht.");
  const region = text(input.region, 80) || null;
  const bio = input.bio && (input.bio.de?.trim() || input.bio.en?.trim()) ? ({ de: text(input.bio.de, 1500), en: text(input.bio.en, 1500) } satisfies Localized<string>) : null;
  const linkedinRaw = text(input.linkedinUrl, 500);
  const linkedinUrl = linkedinRaw ? safeLinkedinUrl(linkedinRaw) : null;
  if (linkedinRaw && !linkedinUrl) throw new ProfileError("Der LinkedIn-Link muss eine https-Adresse auf linkedin.com sein.");

  const own = await getOwnProfile(userId);
  const consent = applyConsent(own.profile?.consent ?? {}, input.consent, now);
  if (own.profile?.published) {
    const problems = publishProblems({ consent }, own.experience, own.certifications);
    if (problems.length) throw new ProfileError("Das veröffentlichte Profil würde unvollständig. Ziehe es zuerst zurück oder ergänze die Angaben.", problems);
  }
  const db = getDb();
  if (!own.profile) {
    const slug = await freeSlug(slugFromName(firstName, lastName));
    await db.insert(reviewerProfiles).values({ userId, slug, firstName, lastName, country, region, bio, linkedinUrl, consent });
  } else {
    await db.update(reviewerProfiles).set({ firstName, lastName, country, region, bio, linkedinUrl, consent, updatedAt: now }).where(eq(reviewerProfiles.userId, userId));
  }
}

async function requireProfile(userId: string): Promise<void> {
  const [row] = await getDb().select({ userId: reviewerProfiles.userId }).from(reviewerProfiles).where(eq(reviewerProfiles.userId, userId)).limit(1);
  if (!row) throw new ProfileError("Lege zuerst dein Profil an.");
}

/** Nach einer Änderung an Einträgen: ein veröffentlichtes Profil muss die Voraussetzungen weiter erfüllen. */
async function assertStillPublishable(userId: string): Promise<void> {
  const own = await getOwnProfile(userId);
  if (!own.profile?.published) return;
  const problems = publishProblems(own.profile, own.experience, own.certifications);
  if (problems.length) throw new ProfileError("Das veröffentlichte Profil würde unvollständig. Ziehe es zuerst zurück oder ergänze die Angaben.", problems);
}

export interface ExperienceInput {
  kind: ReviewerExperienceKind;
  title: string;
  organization?: string | null;
  periodFrom: string;
  periodTo?: string | null;
  description?: string | null;
  isPublic: boolean;
}

function checkExperience(input: ExperienceInput) {
  const title = text(input.title, 150);
  if (!EXPERIENCE_KINDS.includes(input.kind) || !title) throw new ProfileError("Art und Titel sind Pflicht.");
  if (!isPeriod(input.periodFrom) || (input.periodTo && !isPeriod(input.periodTo))) throw new ProfileError("Zeitraum bitte als Jahr oder Monat angeben (2019 oder 2019-04).");
  if (input.periodTo && input.periodTo < input.periodFrom) throw new ProfileError("Das Ende liegt vor dem Beginn.");
  return { kind: input.kind, title, organization: text(input.organization, 150) || null, periodFrom: input.periodFrom, periodTo: input.periodTo || null, description: text(input.description, 800) || null, isPublic: Boolean(input.isPublic) };
}

export async function saveExperience(userId: string, input: ExperienceInput, id?: string): Promise<string> {
  const values = checkExperience(input);
  await requireProfile(userId);
  const db = getDb();
  let savedId = id;
  if (id) {
    const updated = await db.update(reviewerExperience).set(values).where(and(eq(reviewerExperience.id, id), eq(reviewerExperience.userId, userId))).returning({ id: reviewerExperience.id });
    if (updated.length === 0) throw new ProfileError("Eintrag nicht gefunden.");
  } else {
    [{ id: savedId }] = await db.insert(reviewerExperience).values({ userId, ...values }).returning({ id: reviewerExperience.id });
  }
  await assertStillPublishable(userId);
  return savedId!;
}

export async function deleteExperience(userId: string, id: string): Promise<boolean> {
  const deleted = await getDb().delete(reviewerExperience).where(and(eq(reviewerExperience.id, id), eq(reviewerExperience.userId, userId))).returning({ id: reviewerExperience.id });
  if (deleted.length) await assertStillPublishable(userId);
  return deleted.length > 0;
}

export interface CertificationInput {
  vendor: string;
  name: string;
  earnedOn: string;
  validUntil?: string | null;
  verificationUrl: string;
  isPublic: boolean;
}

function checkCertification(input: CertificationInput) {
  const vendor = text(input.vendor, 100);
  const name = text(input.name, 150);
  if (!vendor || !name) throw new ProfileError("Hersteller und Name des Zertifikats sind Pflicht.");
  if (!isIsoDate(input.earnedOn) || (input.validUntil && !isIsoDate(input.validUntil))) throw new ProfileError("Bitte Datumsangaben im Format JJJJ-MM-TT angeben.");
  if (input.validUntil && input.validUntil < input.earnedOn) throw new ProfileError("Das Ablaufdatum liegt vor dem Erwerb.");
  const url = safeHttpsUrl(input.verificationUrl);
  if (!url) throw new ProfileError("Der Nachweis-Link muss eine https-Adresse sein (offizielle Prüfseite des Herstellers).");
  return { vendor, name, earnedOn: input.earnedOn, validUntil: input.validUntil || null, verificationUrl: url, isPublic: Boolean(input.isPublic) };
}

/** Ändert sich der Link, entfällt die Prüfung durch einen Admin; ändert sich das Ablaufdatum, gilt die Erinnerung neu. */
export async function saveCertification(userId: string, input: CertificationInput, id?: string): Promise<string> {
  const values = checkCertification(input);
  await requireProfile(userId);
  const db = getDb();
  let savedId = id;
  if (id) {
    const [current] = await db.select().from(reviewerCertifications).where(and(eq(reviewerCertifications.id, id), eq(reviewerCertifications.userId, userId))).limit(1);
    if (!current) throw new ProfileError("Zertifikat nicht gefunden.");
    await db
      .update(reviewerCertifications)
      .set({
        ...values,
        ...(current.verificationUrl !== values.verificationUrl ? { verifiedAt: null, verifiedByUserId: null } : {}),
        ...(current.validUntil !== values.validUntil ? { remindersSent: {} } : {}),
      })
      .where(eq(reviewerCertifications.id, id));
  } else {
    [{ id: savedId }] = await db.insert(reviewerCertifications).values({ userId, ...values }).returning({ id: reviewerCertifications.id });
  }
  await assertStillPublishable(userId);
  return savedId!;
}

export async function deleteCertification(userId: string, id: string): Promise<boolean> {
  const deleted = await getDb().delete(reviewerCertifications).where(and(eq(reviewerCertifications.id, id), eq(reviewerCertifications.userId, userId))).returning({ id: reviewerCertifications.id });
  if (deleted.length) await assertStillPublishable(userId);
  return deleted.length > 0;
}

/* ------------------------------------------------------------------ Veröffentlichen und Zurückziehen */

export async function publishProfile(userId: string, now = new Date()): Promise<void> {
  const own = await getOwnProfile(userId);
  if (!own.profile) throw new ProfileError("Lege zuerst dein Profil an.");
  const problems = publishProblems(own.profile, own.experience, own.certifications);
  if (problems.length) throw new ProfileError("Das Profil lässt sich noch nicht veröffentlichen.", problems);
  await getDb().update(reviewerProfiles).set({ published: true, publishedAt: own.profile.published ? own.profile.publishedAt : now, updatedAt: now }).where(eq(reviewerProfiles.userId, userId));
  await recordAuditEvent({ actorUserId: userId, action: "reviewer.profile_published", targetType: "reviewer_profile", targetId: userId }).catch(logAuditFailure);
}

/** Rückzug: das Profil ist sofort nicht mehr öffentlich, alle Einwilligungen entfallen. Die Freigaben der Kurse bleiben gültig. */
export async function withdrawProfile(userId: string, now = new Date()): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(reviewerProfiles).set({ published: false, consent: {}, updatedAt: now }).where(eq(reviewerProfiles.userId, userId));
    await tx.update(reviewerExperience).set({ isPublic: false }).where(eq(reviewerExperience.userId, userId));
    await tx.update(reviewerCertifications).set({ isPublic: false }).where(eq(reviewerCertifications.userId, userId));
  });
  await recordAuditEvent({ actorUserId: userId, action: "reviewer.profile_withdrawn", targetType: "reviewer_profile", targetId: userId }).catch(logAuditFailure);
}

/* ------------------------------------------------------------------ Öffentliche Sicht */

export type ApprovedCourse = { slug: string; name: string; versionLabel: string; approvedAt: Date };

/** Die allgemeinen Kurse im Katalog, die diese Person zuletzt freigegeben hat (jeweils der neueste Stand). */
export async function listApprovedCourses(userId: string): Promise<ApprovedCourse[]> {
  const rows = await getDb()
    .select({ certId: courseApprovals.certificationId, slug: certifications.slug, name: certifications.name, versionLabel: courseApprovals.versionLabel, approvedAt: courseApprovals.approvedAt })
    .from(courseApprovals)
    .innerJoin(certifications, eq(certifications.id, courseApprovals.certificationId))
    .where(and(eq(courseApprovals.reviewerUserId, userId), eq(courseApprovals.kind, "approval"), eq(certifications.kind, "general"), eq(certifications.catalogStatus, "approved")))
    .orderBy(desc(courseApprovals.approvedAt));
  const seen = new Set<string>();
  const out: ApprovedCourse[] = [];
  for (const r of rows) {
    if (seen.has(r.certId)) continue;
    seen.add(r.certId);
    out.push({ slug: r.slug, name: r.name, versionLabel: r.versionLabel, approvedAt: r.approvedAt });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Das öffentliche Profil unter `/experts/<slug>`; null, solange es nicht veröffentlicht (oder zurückgezogen) ist. */
export async function getPublicProfile(slug: string, today = new Date()): Promise<{ profile: PublicProfile; courses: ApprovedCourse[] } | null> {
  const [row] = await getDb().select({ userId: reviewerProfiles.userId }).from(reviewerProfiles).where(eq(reviewerProfiles.slug, slug)).limit(1);
  if (!row) return null;
  const own = await getOwnProfile(row.userId);
  if (!own.profile) return null;
  const view = publicView({ slug, published: own.profile.published, profile: own.profile, experience: own.experience, certifications: own.certifications, today });
  if (!view) return null;
  return { profile: view, courses: await listApprovedCourses(row.userId) };
}

/** Name und Profil-Adresse für das Siegel am Kurs: nur bei veröffentlichtem Profil mit Einwilligung für den Namen. */
export async function publicIdentities(userIds: string[]): Promise<Map<string, { name: string; slug: string }>> {
  if (userIds.length === 0) return new Map();
  const rows = await getDb().select().from(reviewerProfiles).where(and(inArray(reviewerProfiles.userId, userIds), eq(reviewerProfiles.published, true)));
  return new Map(rows.filter((r) => r.consent.name).map((r) => [r.userId, { name: `${r.firstName} ${r.lastName}`.trim(), slug: r.slug }]));
}

/* ------------------------------------------------------------------ Admin: Nachweise prüfen */

export type CertificationForAdmin = { id: string; reviewerName: string; reviewerEmail: string; vendor: string; name: string; earnedOn: string; validUntil: string | null; verificationUrl: string; verifiedAt: Date | null };

export async function listCertificationsForAdmin(): Promise<CertificationForAdmin[]> {
  return getDb()
    .select({
      id: reviewerCertifications.id,
      reviewerName: users.email,
      reviewerEmail: users.email,
      vendor: reviewerCertifications.vendor,
      name: reviewerCertifications.name,
      earnedOn: reviewerCertifications.earnedOn,
      validUntil: reviewerCertifications.validUntil,
      verificationUrl: reviewerCertifications.verificationUrl,
      verifiedAt: reviewerCertifications.verifiedAt,
      profileFirst: reviewerProfiles.firstName,
      profileLast: reviewerProfiles.lastName,
    })
    .from(reviewerCertifications)
    .innerJoin(users, eq(users.id, reviewerCertifications.userId))
    .leftJoin(reviewerProfiles, eq(reviewerProfiles.userId, reviewerCertifications.userId))
    .orderBy(asc(reviewerCertifications.verifiedAt), asc(reviewerCertifications.createdAt))
    .then((rows) => rows.map(({ profileFirst, profileLast, ...r }) => ({ ...r, reviewerName: profileFirst ? `${profileFirst} ${profileLast}`.trim() : r.reviewerEmail })));
}

/** Admin hat den Link auf der Seite des Herstellers geprüft (oder nimmt die Prüfung zurück). */
export async function setCertificationVerified(adminUserId: string, id: string, verified: boolean, now = new Date()): Promise<boolean> {
  const updated = await getDb()
    .update(reviewerCertifications)
    .set(verified ? { verifiedAt: now, verifiedByUserId: adminUserId } : { verifiedAt: null, verifiedByUserId: null })
    .where(eq(reviewerCertifications.id, id))
    .returning({ id: reviewerCertifications.id });
  if (updated.length === 0) return false;
  await recordAuditEvent({ actorUserId: adminUserId, action: verified ? "reviewer.certification_verified" : "reviewer.certification_unverified", targetType: "reviewer_certification", targetId: id }).catch(logAuditFailure);
  return true;
}

/* ------------------------------------------------------------------ Erinnerung vor Ablauf */

/** 60 Tage vor Ablauf eines Zertifikats: Mail an die Person und an alle Admins; je Ablaufdatum einmal. Täglich per Cron (`npm run reviewers:remind`). */
export async function runCertificateReminders(now = new Date(), send: (m: MailMessage) => Promise<boolean> = sendMail): Promise<{ sent: number }> {
  const db = getDb();
  const rows = await db
    .select({ cert: reviewerCertifications, email: users.email, first: reviewerProfiles.firstName, last: reviewerProfiles.lastName })
    .from(reviewerCertifications)
    .innerJoin(users, eq(users.id, reviewerCertifications.userId))
    .leftJoin(reviewerProfiles, eq(reviewerProfiles.userId, reviewerCertifications.userId));
  const due = rows.filter((r) => needsExpiryReminder(r.cert, now));
  if (due.length === 0) return { sent: 0 };
  const admins = await db.select({ email: users.email }).from(users).where(eq(users.role, "admin"));
  const base = (path: string) => (isMailConfigured() ? appUrl(path) : path);
  let sent = 0;
  for (const r of due) {
    const reviewerName = r.first ? `${r.first} ${r.last}`.trim() : r.email;
    const base_ = { vendor: r.cert.vendor, name: r.cert.name, validUntil: r.cert.validUntil! };
    const ok = await send(reviewerCertificateExpiryMessage(r.email, { ...base_, link: base("/reviewer/profile") }));
    for (const admin of admins) await send(reviewerCertificateExpiryMessage(admin.email, { ...base_, link: base("/admin/reviewers"), reviewerName }));
    if (!ok) continue;
    await db.update(reviewerCertifications).set({ remindersSent: { ...r.cert.remindersSent, d60: now.toISOString() } }).where(eq(reviewerCertifications.id, r.cert.id));
    sent++;
  }
  return { sent };
}
