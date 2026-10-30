export const dynamic = "force-dynamic";

import { c_reviewerProfilePage } from "@/lib/i18n/components/reviewerProfilePage";
import Link from "next/link";
import { ReviewerProfileEditor, type OwnProfileJson } from "@/components/reviewer/ReviewerProfileEditor";
import { getServerLocale } from "@/lib/server/locale";
import { requireReviewerPage } from "@/lib/server/reviewers/guard";
import { getOwnProfile, listApprovedCourses } from "@/lib/server/reviewers/profile-service";

/** Eigenes Expertenprofil der Prüferin oder des Prüfers: pflegen, einzelne Felder veröffentlichen, zurückziehen. */
export default async function ReviewerProfilePage() {
  const user = await requireReviewerPage("/reviewer/profile");
  const locale = await getServerLocale();
  const de = locale === "de";
  const [own, courses] = await Promise.all([getOwnProfile(user.id), listApprovedCourses(user.id)]);
  const initial: OwnProfileJson = {
    profile: own.profile ? { ...own.profile, bio: own.profile.bio } : null,
    experience: own.experience,
    certifications: own.certifications.map((c) => ({ id: c.id, vendor: c.vendor, name: c.name, earnedOn: c.earnedOn, validUntil: c.validUntil, verificationUrl: c.verificationUrl, isPublic: c.isPublic, verifiedAt: c.verifiedAt ? c.verifiedAt.toISOString() : null })),
    photoVersion: own.photoVersion,
  };
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/reviewer" className="text-sm text-link hover:underline">← {c_reviewerProfilePage(de).myCourse}</Link>
        <h1 className="mt-2 text-2xl font-semibold">{c_reviewerProfilePage(de).myExpertProfile}</h1>
      </div>
      <ReviewerProfileEditor initial={initial} courses={courses.map((c) => ({ slug: c.slug, name: c.name, versionLabel: c.versionLabel, approvedAt: c.approvedAt.toISOString() }))} locale={locale} />
    </div>
  );
}
