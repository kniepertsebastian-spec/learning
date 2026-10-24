/**
 * Expertenprofil (roadmap_pruefer Phase 3): reine Regeln ohne Datenbank. Was öffentlich ist, bestimmt allein die Einwilligung der Person
 * je Feld; die Projektion `publicView` ist die einzige Stelle, die das entscheidet.
 */
import type { ReviewerExperienceKind, ReviewerProfileField } from "@/lib/server/db/schema";
import type { Localized } from "@/lib/types";

export const PROFILE_FIELDS: readonly ReviewerProfileField[] = ["name", "country", "region", "bio", "linkedin", "indexing", "photo"];
export const EXPERIENCE_KINDS: readonly ReviewerExperienceKind[] = ["job", "project", "teaching"];
/** Erinnerung an ablaufende Zertifikate: so viele Tage vorher. */
export const CERT_REMINDER_DAYS = 60;
export const MAX_URL_LENGTH = 500;

export interface ProfileData {
  firstName: string;
  lastName: string;
  country: string;
  region: string | null;
  bio: Localized<string> | null;
  linkedinUrl: string | null;
  consent: Partial<Record<ReviewerProfileField, string>>;
}
export interface ExperienceData {
  id: string;
  kind: ReviewerExperienceKind;
  title: string;
  organization: string | null;
  periodFrom: string;
  periodTo: string | null;
  description: string | null;
  isPublic: boolean;
}
export interface CertificationData {
  id: string;
  vendor: string;
  name: string;
  earnedOn: string;
  validUntil: string | null;
  verificationUrl: string;
  verifiedAt: Date | null;
  isPublic: boolean;
}

/* ---------------------------------------------------------------- Prüfung von Eingaben */

/** Nachweis- und Profil-Links: nur https, mit Host, ohne Zugangsdaten. Gibt die bereinigte URL zurück oder null. */
export function safeHttpsUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value || value.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** LinkedIn-Link: https und Host linkedin.com (auch Subdomänen wie de.linkedin.com). */
export function safeLinkedinUrl(raw: string | null | undefined): string | null {
  const url = safeHttpsUrl(raw);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase();
  return host === "linkedin.com" || host.endsWith(".linkedin.com") ? url : null;
}

/** „2019“ oder „2019-04“. */
export const isPeriod = (value: string | null | undefined): value is string => typeof value === "string" && /^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/.test(value);
export function isIsoDate(value: string | null | undefined): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Lesbare Adresse aus Name: „Dr. Éva Müller“ → „eva-mueller“; leer, wenn nichts übrig bleibt. */
export function slugFromName(firstName: string, lastName: string): string {
  const base = `${firstName} ${lastName}`
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base;
}

/* ---------------------------------------------------------------- Veröffentlichung */

/** Wer veröffentlichen will, braucht Name und Land (mit Einwilligung) und mindestens einen öffentlichen Eintrag zu Erfahrung oder Zertifikat. */
export function publishProblems(profile: Pick<ProfileData, "consent">, experience: Pick<ExperienceData, "isPublic">[], certifications: Pick<CertificationData, "isPublic">[]): string[] {
  const problems: string[] = [];
  if (!profile.consent.name) problems.push("Name: Einwilligung zur Veröffentlichung fehlt.");
  if (!profile.consent.country) problems.push("Land: Einwilligung zur Veröffentlichung fehlt.");
  if (!experience.some((e) => e.isPublic) && !certifications.some((c) => c.isPublic)) problems.push("Mindestens ein öffentliches Zertifikat oder ein öffentlicher Erfahrungseintrag fehlt.");
  return problems;
}

/** Neue Einwilligungen: bestehende behalten ihren Zeitpunkt, neue bekommen `now`, zurückgenommene fallen weg. */
export function applyConsent(current: ProfileData["consent"], wanted: Partial<Record<ReviewerProfileField, boolean>>, now: Date): ProfileData["consent"] {
  const next: ProfileData["consent"] = {};
  for (const field of PROFILE_FIELDS) {
    const want = field in wanted ? wanted[field] : Boolean(current[field]);
    if (want) next[field] = current[field] ?? now.toISOString();
  }
  return next;
}

/* ---------------------------------------------------------------- Zertifikate */

export type CertStatus = "valid" | "expiring" | "expired";

/** „abgelaufen“ statt Verstecken; „läuft bald ab“ ab CERT_REMINDER_DAYS vor dem Ende. Ohne Ablaufdatum immer gültig. */
export function certStatus(validUntil: string | null, today: Date): CertStatus {
  if (!validUntil) return "valid";
  const end = Date.parse(`${validUntil}T23:59:59Z`);
  if (end < today.getTime()) return "expired";
  return end - today.getTime() <= CERT_REMINDER_DAYS * 86_400_000 ? "expiring" : "valid";
}

/** Soll jetzt die 60-Tage-Erinnerung raus? Einmal je Ablaufdatum, nur solange das Zertifikat noch gilt. */
export function needsExpiryReminder(cert: { validUntil: string | null; remindersSent: { d60?: string } }, today: Date): boolean {
  return Boolean(cert.validUntil) && !cert.remindersSent.d60 && certStatus(cert.validUntil, today) === "expiring";
}

/* ---------------------------------------------------------------- Öffentliche Sicht */

export interface PublicProfile {
  slug: string;
  name: string;
  country: string;
  region: string | null;
  bio: Localized<string> | null;
  linkedinUrl: string | null;
  /** Adresse des Fotos (mit Versionsnummer gegen Zwischenspeicher), nur mit Einwilligung und vorhandenem Foto. */
  photoUrl: string | null;
  indexable: boolean;
  experience: Array<Omit<ExperienceData, "id" | "isPublic">>;
  certifications: Array<{ vendor: string; name: string; earnedOn: string; validUntil: string | null; verificationUrl: string; verifiedAt: string | null; status: CertStatus }>;
}

/** Was die Öffentlichkeit sehen darf: nur eingewilligte Felder und öffentliche Einträge; null, solange nicht veröffentlicht. */
export function publicView(input: { slug: string; published: boolean; profile: ProfileData; experience: ExperienceData[]; certifications: CertificationData[]; today: Date; photoVersion?: number | null }): PublicProfile | null {
  const { profile } = input;
  if (!input.published || !profile.consent.name || !profile.consent.country) return null;
  return {
    slug: input.slug,
    name: `${profile.firstName} ${profile.lastName}`.trim(),
    country: profile.country,
    region: profile.consent.region ? profile.region : null,
    bio: profile.consent.bio ? profile.bio : null,
    linkedinUrl: profile.consent.linkedin ? profile.linkedinUrl : null,
    photoUrl: profile.consent.photo && input.photoVersion ? `/api/experts/${input.slug}/photo?v=${input.photoVersion}` : null,
    indexable: Boolean(profile.consent.indexing),
    experience: input.experience.filter((e) => e.isPublic).map((e) => ({ kind: e.kind, title: e.title, organization: e.organization, periodFrom: e.periodFrom, periodTo: e.periodTo, description: e.description })),
    certifications: input.certifications
      .filter((c) => c.isPublic)
      .map((c) => ({ vendor: c.vendor, name: c.name, earnedOn: c.earnedOn, validUntil: c.validUntil, verificationUrl: c.verificationUrl, verifiedAt: c.verifiedAt ? c.verifiedAt.toISOString() : null, status: certStatus(c.validUntil, input.today) })),
  };
}

/** „Bayern, Deutschland“ bzw. nur das Land. */
export const placeLabel = (region: string | null, country: string) => (region ? `${region}, ${country}` : country);
