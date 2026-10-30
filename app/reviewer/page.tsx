export const dynamic = "force-dynamic";

import { c_reviewerPage } from "@/lib/i18n/components/reviewerPage";
import Link from "next/link";
import { getApprovalStatus } from "@/lib/server/approvals/service";
import { getServerLocale } from "@/lib/server/locale";
import { requireReviewerPage } from "@/lib/server/reviewers/guard";
import { listAssignedCourses } from "@/lib/server/reviewers/service";
import { isQualified } from "@/lib/server/reviewers/probe-service";

/** Fachliche Prüfer: die ihnen zugewiesenen allgemeinen Kurse mit Stand der Freigabe. */
export default async function ReviewerHome() {
  const user = await requireReviewerPage("/reviewer");
  const locale = await getServerLocale();
  const de = locale === "de";
  const [courses, qualified] = await Promise.all([listAssignedCourses(user.id), isQualified(user.id)]);
  const statuses = await Promise.all(courses.map((c) => getApprovalStatus(c.id)));
  return (
    <div className="flex flex-col gap-4" data-testid="reviewer-home">
      <h1 className="text-2xl font-semibold">{c_reviewerPage(de).myCourse}</h1>
      <p className="text-sm text-subtle">{c_reviewerPage(de).youLookAfterExactlyOne}</p>
      {!qualified && (
        <p className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-text" data-testid="reviewer-not-qualified">
          {c_reviewerPage(de).youCanApproveCoursesAnd}
          <Link href="/reviewer/probe" className="font-medium underline" data-testid="reviewer-probe-link">{c_reviewerPage(de).toTheTrialReview}</Link>
        </p>
      )}
      <p className="text-sm">
        <Link href="/reviewer/profile" className="text-link hover:underline" data-testid="reviewer-profile-link">{c_reviewerPage(de).manageMyExpertProfile}</Link>
      </p>
      {courses.length === 0 ? (
        <p className="text-sm text-subtle" data-testid="reviewer-empty">{c_reviewerPage(de).noCourseIsAssignedTo}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {courses.map((c, i) => {
            const s = statuses[i];
            return (
              <li key={c.id} className="rounded-2xl border border-border bg-surface p-5 text-sm" data-testid="reviewer-course">
                <Link href={`/reviewer/${c.slug}`} className="font-medium text-link hover:underline">{c.name}</Link>
                <p className="mt-1 text-subtle">
                  {s.state === "none" && (c_reviewerPage(de).notApprovedYet)}
                  {s.state === "current" && s.approval && `${c_reviewerPage(de).approvedBy} ${s.approval.reviewerDisplayName} · ${c_reviewerPage(de).version} ${s.approval.versionLabel}`}
                  {s.state === "changed" && `${s.changeCount} ${de ? (s.changeCount === 1 ? "Änderung seit Prüfung" : "Änderungen seit Prüfung") : s.changeCount === 1 ? "change since review" : "changes since review"}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
