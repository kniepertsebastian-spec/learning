export const dynamic = "force-dynamic";

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
      <h1 className="text-2xl font-semibold">{de ? "Mein Kurs" : "My course"}</h1>
      <p className="text-sm text-subtle">{de ? "Du betreust genau einen Kurs, den dir die Betreiber zugewiesen haben. Du kannst ihn lesen, kommentieren, Fragen als fehlerhaft melden, Lektionen, Simulationen und Fragen von Hand bearbeiten und freigeben." : "You look after exactly one course, assigned to you by the operators. You can read it, comment, report questions as faulty, edit lessons, simulations and questions by hand, and approve it."}</p>
      {!qualified && (
        <p className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-text" data-testid="reviewer-not-qualified">
          {de ? "Freigeben und dein Profil veröffentlichen kannst du erst nach dem Probe-Review. " : "You can approve courses and publish your profile only after the trial review. "}
          <Link href="/reviewer/probe" className="font-medium underline" data-testid="reviewer-probe-link">{de ? "Zum Probe-Review" : "To the trial review"}</Link>
        </p>
      )}
      <p className="text-sm">
        <Link href="/reviewer/profile" className="text-link hover:underline" data-testid="reviewer-profile-link">{de ? "Mein Expertenprofil pflegen" : "Manage my expert profile"}</Link>
      </p>
      {courses.length === 0 ? (
        <p className="text-sm text-subtle" data-testid="reviewer-empty">{de ? "Dir ist noch kein Kurs zugewiesen." : "No course is assigned to you yet."}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {courses.map((c, i) => {
            const s = statuses[i];
            return (
              <li key={c.id} className="rounded-lg border border-border bg-surface p-4 text-sm" data-testid="reviewer-course">
                <Link href={`/reviewer/${c.slug}`} className="font-medium text-link hover:underline">{c.name}</Link>
                <p className="mt-1 text-subtle">
                  {s.state === "none" && (de ? "Noch nicht freigegeben" : "Not approved yet")}
                  {s.state === "current" && s.approval && `${de ? "Freigegeben von" : "Approved by"} ${s.approval.reviewerDisplayName} · ${de ? "Version" : "Version"} ${s.approval.versionLabel}`}
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
