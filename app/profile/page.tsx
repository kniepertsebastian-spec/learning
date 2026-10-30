export const dynamic = "force-dynamic";

import { c_profilePage } from "@/lib/i18n/components/profilePage";
import { fill } from "@/lib/i18n/fill";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, users } from "@/lib/server/db/schema";
import { CareerProfile } from "@/components/profile/CareerProfile";
import { LearningProfileExport } from "@/components/profile/LearningProfileExport";
import { listEligibleCourses, listIssuedProfiles } from "@/lib/server/profile-export/service";
import { getProfile } from "@/lib/server/profile/service";
import { listMyAssignments, type MyAssignment } from "@/lib/server/assignments/sync";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getCompanyMembership } from "@/lib/server/company/access";
import { getServerLocale } from "@/lib/server/locale";
import { getProgressView, listProgressCourses } from "@/lib/server/progress/snapshots";
import { ProgressReviewCard } from "@/components/ProgressReviewCard";

const ROLE_LABEL = {
  company_admin: { de: "Firmen-Admin", en: "Company admin" },
  mentor: { de: "Mentor", en: "Mentor" },
  learner: { de: "Lernende/r", en: "Learner" },
} as const;

/** Statuswörter wie im Firmenbereich: Bestanden / In Arbeit / Noch offen. */
const STATUS_LABEL = {
  completed: { de: "Bestanden", en: "Passed" },
  in_progress: { de: "In Arbeit", en: "In progress" },
  assigned: { de: "Noch offen", en: "Not started" },
} as const;

/**
 * Eigenes Profil: wer ich bin und welche Kurse meine Firma mir bereitgestellt hat, mit Stand (bestanden / in Arbeit / noch offen)
 * und Datum. Es sind die eigenen Daten; die Firma sieht davon nur Status und Daten, nie Ergebnisse.
 */
export default async function ProfilePage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getServerLocale()]);
  if (!user) redirect("/login?from=%2Fprofile");
  const de = locale === "de";
  const [membership, assignments, [row], career, catalog] = await Promise.all([
    getCompanyMembership(user.id),
    listMyAssignments(user.id),
    getDb().select({ name: users.name }).from(users).where(eq(users.id, user.id)).limit(1),
    getProfile(user.id),
    getDb().select({ name: certifications.name }).from(certifications).where(and(eq(certifications.kind, "general"), eq(certifications.catalogStatus, "approved"))).orderBy(asc(certifications.name)),
  ]);
  // Rückblick „Vor 3 Wochen … Heute …“: nur eigene, echte Stände; für höchstens drei Kurse mit festgehaltenem Fortschritt.
  const progress = await Promise.all((await listProgressCourses(user.id).catch(() => [])).map(async (c) => ({ course: c, view: await getProgressView(user.id, c.id).catch(() => null) })));
  const fmt = (d: Date) => d.toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" });
  const done = assignments.filter((a) => a.status === "completed");
  const rest = assignments.filter((a) => a.status !== "completed");

  const item = (a: MyAssignment) => (
    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm" data-testid="profile-course">
      <Link href={`/cert/${a.slug}`} className="font-medium hover:text-link">{a.learningPath}</Link>
      <span className="text-muted" data-testid="profile-course-status">
        {STATUS_LABEL[a.status][locale]}
        {a.status === "completed" && a.completedAt ? ` · ${fmt(a.completedAt)}` : ""}
        {a.status !== "completed" && a.dueAt ? ` · ${c_profilePage(de).due} ${fmt(a.dueAt)}` : ""}
        {a.status !== "completed" && a.lastCompletedAt ? ` · ${c_profilePage(de).lastPassed} ${fmt(a.lastCompletedAt)}` : ""}
      </span>
    </li>
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6" data-testid="profile-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{c_profilePage(de).myProfile}</h1>
          <p className="mt-1 break-words text-sm text-muted" data-testid="profile-identity">
            {row?.name ? `${row.name} · ` : ""}{user.email}
            {membership ? ` · ${membership.organizationName} (${ROLE_LABEL[membership.role][locale]})` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/how-i-learn" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background" data-testid="profile-how-i-learn-link">
            {c_profilePage(de).howILearn}
          </Link>
          <Link href="/account" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background" data-testid="profile-account-link">
            {c_profilePage(de).accountData}
          </Link>
        </div>
      </header>

      {progress.some((p) => p.view && (p.view.review || p.view.outlook)) && (
        <section className="flex flex-col gap-1" data-testid="profile-progress">
          <h2 className="font-semibold">{c_profilePage(de).myProgress}</h2>
          {progress.map(({ course, view }) =>
            view && (view.review || view.outlook) ? (
              <div key={course.id}>
                <p className="mb-1 text-xs text-muted">{course.name}</p>
                <ProgressReviewCard review={view.review} outlook={view.outlook} series={view.series} locale={locale} certSlug={course.slug} />
              </div>
            ) : null,
          )}
        </section>
      )}

      <LearningProfileExport
        locale={locale}
        courses={(await listEligibleCourses(user.id).catch(() => [])).map((c) => ({ course: c.course, certificate: c.certificate }))}
        issued={(await listIssuedProfiles(user.id).catch(() => [])).map((i) => ({ id: i.id, issuedAt: i.issuedAt.toISOString(), revokedAt: i.revokedAt ? i.revokedAt.toISOString() : null }))}
      />

      <CareerProfile initial={career} courseNames={catalog.map((c) => c.name)} />

      <section className="rounded-2xl border border-border bg-surface p-5" data-testid="profile-courses">
        <h2 className="font-semibold">{c_profilePage(de).yourCompanySCourses}</h2>
        <p className="mt-1 text-xs text-muted">
          {c_profilePage(de).theseAreTheCoursesYour}
        </p>
        {assignments.length === 0 ? (
          <p className="mt-3 text-sm text-muted" data-testid="profile-empty">
            {membership
              ? c_profilePage(de).yourCompanyHasNotProvided
              : c_profilePage(de).youDoNotBelongTo}
          </p>
        ) : (
          <>
            {done.length > 0 && (
              <>
                <h3 className="mt-4 text-sm font-medium">{fill(c_profilePage(de).completed0, done.length)}</h3>
                <ul className="mt-2 flex flex-col gap-2" data-testid="profile-done">{done.map(item)}</ul>
              </>
            )}
            {rest.length > 0 && (
              <>
                <h3 className="mt-4 text-sm font-medium">{fill(c_profilePage(de).open0, rest.length)}</h3>
                <ul className="mt-2 flex flex-col gap-2" data-testid="profile-open">{rest.map(item)}</ul>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
