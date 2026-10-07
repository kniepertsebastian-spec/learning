export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { MyPracticeTasks } from "@/components/MyPracticeTasks";
import { SignOutButton } from "@/components/SignOutButton";
import { listMyAssignments } from "@/lib/server/assignments/sync";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { visibleCertificationsCondition } from "@/lib/server/catalog/visibility";
import { getCompanyMembership, isRoleAllowed, STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { listMyPracticeTasks } from "@/lib/server/company/practice-tasks";
import { getServerLocale } from "@/lib/server/locale";

const ASSIGNMENT_STATUS = {
  assigned: { de: "Zugewiesen", en: "Assigned" },
  in_progress: { de: "In Arbeit", en: "In progress" },
  completed: { de: "Abgeschlossen", en: "Completed" },
} as const;

export default async function DashboardPage() {
  const db = getDb();
  const [session, user, locale] = await Promise.all([auth(), getCurrentUser(), getServerLocale()]);
  // Nur fachlich freigegebene Lernpfade (Plattform-Admins sehen alle); interne nur für die eigene Firma.
  const certs = await db
    .select()
    .from(certifications)
    .where(await visibleCertificationsCondition(user ? { id: user.id, role: user.role } : null))
    .orderBy(certifications.name);
  const de = locale === "de";
  const [assignments, membership] = session?.user?.id
    ? await Promise.all([listMyAssignments(session.user.id), getCompanyMembership(session.user.id)])
    : [[], null];
  const practiceTasks = membership ? await listMyPracticeTasks(membership.organizationId, membership.userId) : [];
  // Firmen-Admin und Mentor kommen von der Startseite direkt in den Firmenbereich.
  const companyMembership = isRoleAllowed(membership, STATUS_VIEW_ROLES) ? membership : null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {session?.user
            ? `Welcome back, ${session.user.name ?? session.user.email}!`
            : "Certifications"}
        </h1>
        <div className="flex items-center gap-2">
          {session?.user?.id ? (
            <SignOutButton userId={session.user.id} />
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>

      {companyMembership && (
        <Link
          href="/company"
          className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/5 p-5 hover:border-accent"
          data-testid="company-entry"
        >
          <span>
            <span className="block font-semibold">
              {de ? `Firmenbereich: ${companyMembership.organizationName}` : `Company area: ${companyMembership.organizationName}`}
            </span>
            <span className="mt-1 block text-sm text-foreground/70">
              {companyMembership.role === "company_admin"
                ? de ? "Lernpfade zuweisen, Status ansehen, Mitarbeiter einladen" : "Assign learning paths, view status, invite people"
                : de ? "Lernpfade zuweisen und Status ansehen" : "Assign learning paths and view status"}
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
        </Link>
      )}

      {assignments.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-surface p-5" data-testid="my-assignments">
          <h2 className="font-semibold">{de ? "Von deiner Firma zugewiesen" : "Assigned by your company"}</h2>
          <p className="mt-1 text-xs text-foreground/70">
            {de
              ? "Deine Firma sieht dazu nur Status, Zuweisungs-, Frist- und Abschlussdatum, keine Ergebnisse oder Antworten."
              : "Your company only sees status, assignment, due and completion dates, never results or answers."}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={`/cert/${a.slug}`} className="font-medium hover:text-accent">
                  {a.learningPath}
                </Link>
                <span className="text-foreground/70">
                  {ASSIGNMENT_STATUS[a.status][locale]}
                  {a.dueAt && a.status !== "completed"
                    ? ` · ${de ? "Frist" : "Due"} ${a.dueAt.toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {practiceTasks.length > 0 && <MyPracticeTasks tasks={practiceTasks} locale={locale} />}

      {certs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <GraduationCap className="mb-4 h-12 w-12 text-foreground/40" aria-hidden="true" />
          <h2 className="mb-2 text-lg font-medium">No certifications available yet</h2>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certs.map((cert) => (
            <Link
              key={cert.id}
              href={`/cert/${cert.slug}`}
              className="group rounded-xl border border-border bg-surface p-5 hover:border-accent"
            >
              <h2 className="mb-1 font-semibold group-hover:text-accent">{cert.name}</h2>
              <p className="mb-4 text-sm text-foreground/60">
                {cert.examName} {cert.examVersion}
              </p>
              <span className="inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
                {session ? "Continue learning →" : "Start learning →"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
