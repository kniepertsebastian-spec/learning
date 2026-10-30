export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/server/auth";
import { Dashboard, type DashboardData } from "@/components/dashboard/Dashboard";
import { ExamResultPrompt } from "@/components/ExamResultPrompt";
import { MyPracticeTasks } from "@/components/MyPracticeTasks";
import { Button } from "@/components/ui/button";
import { listMyAssignments } from "@/lib/server/assignments/sync";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getCompanyMembership, isRoleAllowed, STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { getPendingResultPrompts } from "@/lib/server/exams/planner";
import { findMentorUserId, listMyMentorRequests } from "@/lib/server/company/mentor-requests";
import { listMyPracticeTasks } from "@/lib/server/company/practice-tasks";
import { getLearnerDashboard } from "@/lib/server/dashboard/service";
import { getServerLocale } from "@/lib/server/locale";
import { uiStrings } from "@/lib/i18n-strings";
import { fmt } from "@/lib/quiz/keys";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ kurs?: string | string[] }> }) {
  const [session, user, locale, params] = await Promise.all([auth(), getCurrentUser(), getServerLocale(), searchParams]);
  const h = uiStrings[locale].home;

  if (!session?.user?.id || !user) {
    return (
      <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 py-16 text-center" data-testid="welcome">
        <h1 className="text-title font-semibold tracking-title">{h.welcomeTitle}</h1>
        <p className="text-subtle">{h.welcomeBody}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild><Link href="/login">{h.signIn}</Link></Button>
          <Button asChild variant="secondary"><Link href="/register">{h.register}</Link></Button>
          <Button asChild variant="ghost"><Link href="/catalog">{h.browseCatalog}</Link></Button>
        </div>
      </div>
    );
  }

  const mainSlug = typeof params.kurs === "string" ? params.kurs : null;
  const now = new Date();
  const [dash, assignments, membership, resultPrompts] = await Promise.all([
    getLearnerDashboard({ id: user.id, role: user.role }, now, { mainSlug }),
    listMyAssignments(user.id),
    getCompanyMembership(user.id),
    getPendingResultPrompts(user.id),
  ]);
  const practiceTasks = membership ? await listMyPracticeTasks(membership.organizationId, membership.userId) : [];
  const canAskMentor = membership ? (await findMentorUserId(membership.organizationId, membership.userId)) !== null : false;
  const myMentorRequests = membership ? await listMyMentorRequests(membership.organizationId, membership.userId) : [];
  // Firmen-Admin und Mentor kommen von der Startseite direkt in den Firmenbereich.
  const companyMembership = isRoleAllowed(membership, STATUS_VIEW_ROLES) ? membership : null;
  const name = session.user.name ?? user.email.split("@")[0];
  const openTasks = practiceTasks.filter((t) => t.status === "open" || t.status === "rework").length;

  const events: DashboardData["events"] = [
    ...dash.certs.flatMap((c) =>
      c.examInDays !== null && c.examInDays >= 0
        ? [{ kind: "exam" as const, name: c.name, dateIso: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + c.examInDays * 86_400_000).toISOString(), href: `/cert/${c.slug}` }]
        : [],
    ),
    ...assignments.flatMap((a) => (a.dueAt && a.status !== "completed" ? [{ kind: "deadline" as const, name: a.learningPath, dateIso: a.dueAt.toISOString(), href: `/cert/${a.slug}` }] : [])),
  ];

  const data: DashboardData = {
    name,
    certs: dash.certs,
    main: dash.main
      ? {
          certSlug: dash.main.cert.slug,
          certName: dash.main.cert.name,
          examInDays: dash.main.cert.examInDays,
          readiness: { score: dash.main.readiness.score, level: dash.main.readiness.level, coverage: dash.main.readiness.coverage },
          domains: dash.main.domains,
          recommendation: dash.main.recommendation,
          dueCount: dash.main.dueCount,
          progress: dash.main.progress,
        }
      : null,
    hero: dash.hero ? { ...dash.hero, lastAtIso: dash.hero.lastAt ? dash.hero.lastAt.toISOString() : null } : null,
    dueTotal: dash.dueTotal,
    streak: dash.streak,
    welcomeBack: dash.welcomeBack,
    stats: dash.stats,
    week: dash.week,
    learningMinutesWeek: dash.learningMinutesWeek,
    activeDays: dash.activeDays,
    recent: dash.recent.map((r) => ({ ...r, atIso: r.at.toISOString(), at: undefined })),
    events,
    open: [
      ...assignments.filter((a) => a.status !== "completed").map((a) => ({ kind: "assignment" as const, name: a.learningPath, slug: a.slug, dueIso: a.dueAt ? a.dueAt.toISOString() : null })),
      ...(openTasks > 0 ? [{ kind: "practice" as const, count: openTasks }] : []),
      ...myMentorRequests.map((r) => ({ kind: "mentor" as const, topic: r.topic, answered: r.status === "answered", note: r.answerNote })),
    ],
    nowIso: now.toISOString(),
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      {resultPrompts[0] && <ExamResultPrompt planId={resultPrompts[0].planId} certName={resultPrompts[0].certName} locale={locale} />}
      {companyMembership && (
        <Link href="/company" className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4 hover:border-border-strong" data-testid="company-entry">
          <span className="flex min-w-0 items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-semibold">{fmt(h.companyArea, { name: companyMembership.organizationName })}</span>
              <span className="mt-0.5 block text-sm text-subtle">{companyMembership.role === "company_admin" ? h.companyAreaAdmin : h.companyAreaMentor}</span>
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-subtle" aria-hidden="true" />
        </Link>
      )}

      <Dashboard data={data} />

      {practiceTasks.length > 0 && <MyPracticeTasks tasks={practiceTasks} locale={locale} canAskMentor={canAskMentor} />}
    </div>
  );
}
