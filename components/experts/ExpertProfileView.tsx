import { c_expertsExpertProfileView } from "@/lib/i18n/components/expertsExpertProfileView";
import { BadgeCheck, ExternalLink, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { placeLabel, type PublicProfile } from "@/lib/reviewers/profile";
import type { ApprovedCourse } from "@/lib/server/reviewers/profile-service";
import type { Locale } from "@/lib/types";

const KIND_LABEL = {
  job: { de: "Beruf", en: "Job" },
  project: { de: "Projekt", en: "Project" },
  teaching: { de: "Lehre", en: "Teaching" },
} as const;

const dateOf = (iso: string, locale: Locale) => new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" });
const periodOf = (from: string, to: string | null, locale: Locale) => `${from} – ${to ?? (c_expertsExpertProfileView(locale).present)}`;

/** Öffentliche Sicht eines Expertenprofils; zeigt nur, was `publicView` geliefert hat. Ohne Hooks, auch für die Vorschau im Editor. */
export function ExpertProfileView({ profile, courses, locale }: { profile: PublicProfile; courses: Array<Pick<ApprovedCourse, "slug" | "name" | "versionLabel"> & { approvedAt: Date | string }>; locale: Locale }) {
  const de = locale === "de";
  const bio = profile.bio ? (profile.bio[locale] || profile.bio[locale === "de" ? "en" : "de"]) : null;
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6" data-testid="expert-profile">
      <header>
        {profile.photoUrl && (
          // Bewusst ohne loading="lazy": das Foto steht oben im ersten Bildschirm, verzögertes Laden verschlechtert dort LCP.
          // eslint-disable-next-line @next/next/no-img-element -- kleines Profilbild aus eigener Route, nicht optimierbar
          <img src={profile.photoUrl} alt={`${c_expertsExpertProfileView(de).photoOf} ${profile.name}`} width={96} height={96} decoding="async" className="mb-3 h-24 w-24 rounded-full border border-border object-cover" data-testid="expert-photo" />
        )}
        <p className="text-xs font-semibold tracking-wide text-subtle uppercase">{c_expertsExpertProfileView(de).expertReviewer}</p>
        <h1 className="mt-1 text-3xl font-semibold" data-testid="expert-name">{profile.name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-subtle" data-testid="expert-place">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {placeLabel(profile.region, profile.country)}
        </p>
        {profile.linkedinUrl && (
          <p className="mt-2 text-sm">
            <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-link hover:underline" data-testid="expert-linkedin">
              LinkedIn <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </p>
        )}
      </header>

      {bio && (
        <section aria-labelledby="expert-bio">
          <h2 id="expert-bio" className="mb-1 text-lg font-semibold">{c_expertsExpertProfileView(de).about}</h2>
          <p className="whitespace-pre-wrap text-body leading-relaxed" data-testid="expert-bio-text">{bio}</p>
        </section>
      )}

      {profile.experience.length > 0 && (
        <section aria-labelledby="expert-experience">
          <h2 id="expert-experience" className="mb-2 text-lg font-semibold">{c_expertsExpertProfileView(de).experience}</h2>
          <ul className="flex flex-col gap-3">
            {profile.experience.map((e, i) => (
              <li key={i} className="rounded-xl border border-border bg-surface p-3 text-sm" data-testid="expert-experience-item">
                <p className="font-medium">
                  {e.title}
                  {e.organization ? <span className="font-normal text-subtle"> · {e.organization}</span> : null}
                </p>
                <p className="text-xs text-subtle">{KIND_LABEL[e.kind][locale]} · {periodOf(e.periodFrom, e.periodTo, locale)}</p>
                {e.description && <p className="mt-1 whitespace-pre-wrap">{e.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.certifications.length > 0 && (
        <section aria-labelledby="expert-certs">
          <h2 id="expert-certs" className="mb-2 text-lg font-semibold">{c_expertsExpertProfileView(de).certifications}</h2>
          <ul className="flex flex-col gap-3">
            {profile.certifications.map((c, i) => (
              <li key={i} className="rounded-xl border border-border bg-surface p-3 text-sm" data-testid="expert-cert" data-status={c.status}>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {c.name} <span className="font-normal text-subtle">· {c.vendor}</span>
                  {c.status === "expired" && <Badge tone="warning">{c_expertsExpertProfileView(de).expired}</Badge>}
                  {c.status === "expiring" && <Badge tone="info">{c_expertsExpertProfileView(de).expiresSoon}</Badge>}
                </p>
                <p className="text-xs text-subtle">
                  {c_expertsExpertProfileView(de).earned} {dateOf(c.earnedOn, locale)}
                  {c.validUntil ? ` · ${c_expertsExpertProfileView(de).validUntil} ${dateOf(c.validUntil, locale)}` : ""}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                  <a href={c.verificationUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-link hover:underline">
                    {c_expertsExpertProfileView(de).proofAtTheVendor} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  {c.verifiedAt ? (
                    <span className="inline-flex items-center gap-1 text-mint-text" data-testid="expert-cert-verified">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> {c_expertsExpertProfileView(de).proofCheckedOn} {dateOf(c.verifiedAt, locale)}
                    </span>
                  ) : (
                    <span className="text-subtle" data-testid="expert-cert-unverified">{c_expertsExpertProfileView(de).proofNotCheckedYet}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {courses.length > 0 && (
        <section aria-labelledby="expert-courses">
          <h2 id="expert-courses" className="mb-2 text-lg font-semibold">{c_expertsExpertProfileView(de).reviewedCourses}</h2>
          <ul className="flex flex-col gap-1 text-sm" data-testid="expert-courses">
            {courses.map((c) => (
              <li key={c.slug}>
                {c.name} <span className="text-subtle">· {c_expertsExpertProfileView(de).version} {c.versionLabel} · {dateOf(new Date(c.approvedAt).toISOString(), locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
