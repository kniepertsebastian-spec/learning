export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/server/auth";
import { Dashboard, type DashboardData } from "@/components/dashboard/Dashboard";
import { MyPracticeTasks } from "@/components/MyPracticeTasks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listMyAssignments } from "@/lib/server/assignments/sync";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getCompanyMembership, isRoleAllowed, STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { listMyPracticeTasks } from "@/lib/server/company/practice-tasks";
import { getLearnerDashboard } from "@/lib/server/dashboard/service";
import { getServerLocale } from "@/lib/server/locale";
import { uiStrings } from "@/lib/i18n-strings";
import { fmt } from "@/lib/quiz/keys";

export default async function HomePage() {
  const [session, user, locale] = await Promise.all([auth(), getCurrentUser(), getServerLocale()]);
  const h = uiStrings[locale].home;

  if (!session?.user?.id || !user) {
    return (
      <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 py-16 text-center" data-testid="welcome">
        <h1 className="text-3xl font-semibold tracking-tight">{h.welcomeTitle}</h1>
        <p className="text-subtle">{h.welcomeBody}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild><Link href="/login">{h.signIn}</Link></Button>
          <Button asChild variant="secondary"><Link href="/register">{h.register}</Link></Button>
          <Button asChild variant="ghost"><Link href="/catalog">{h.browseCatalog}</Link></Button>
        </div>
      </div>
    );
  }

  const [dash, assignments, membership] = await Promise.all([
    getLearnerDashboard({ id: user.id, role: user.role }),
    listMyAssignments(user.id),
    getCompanyMembership(user.id),
  ]);
  const practiceTasks = membership ? await listMyPracticeTasks(membership.organizationId, membership.userId) : [];
  // Firmen-Admin und Mentor kommen von der Startseite direkt in den Firmenbereich.
  const companyMembership = isRoleAllowed(membership, STATUS_VIEW_ROLES) ? membership : null;
  const de = locale === "de";
  const name = session.user.name ?? user.email.split("@")[0];
  const statusText = { assigned: h.statusAssigned, in_progress: h.statusInProgress, completed: h.statusCompleted } as const;

  const data: DashboardData = {
    name,
    certs: dash.certs,
    main: dash.main
      ? {
          certSlug: dash.main.cert.slug,
          certName: dash.main.cert.name,
          examInDays: dash.main.cert.examInDays,
          readiness: { score: dash.main.readiness.score },
          domains: dash.main.domains,
          recommendation: dash.main.recommendation,
          dueCount: dash.main.dueCount,
        }
      : null,
    hero: dash.hero ? { ...dash.hero, lastAtIso: dash.hero.lastAt ? dash.hero.lastAt.toISOString() : null } : null,
    dueTotal: dash.dueTotal,
    streak: dash.streak,
    stats: dash.stats,
    week: dash.week,
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      {companyMembership && (
        <Link href="/company" className="flex items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-5 hover:border-warning" data-testid="company-entry">
          <span>
            <span className="block font-semibold">{fmt(h.companyArea, { name: companyMembership.organizationName })}</span>
            <span className="mt-1 block text-sm text-muted">{companyMembership.role === "company_admin" ? h.companyAreaAdmin : h.companyAreaMentor}</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-warning-text" aria-hidden="true" />
        </Link>
      )}

      <Dashboard data={data} />

      {assignments.length > 0 && (
        <Card data-testid="my-assignments">
          <h2 className="font-semibold">{h.assigned}</h2>
          <p className="mt-1 text-xs text-subtle">{h.assignedNote}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={`/cert/${a.slug}`} className="font-medium hover:text-link">{a.learningPath}</Link>
                <span className="text-subtle">
                  {statusText[a.status]}
                  {a.dueAt && a.status !== "completed" ? ` · ${h.due} ${a.dueAt.toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {practiceTasks.length > 0 && <MyPracticeTasks tasks={practiceTasks} locale={locale} />}
    </div>
  );
}
