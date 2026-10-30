export const dynamic = "force-dynamic";

import { c_certIdPage } from "@/lib/i18n/components/certIdPage";
import { fill } from "@/lib/i18n/fill";
import { CourseSeal } from "@/components/seal/CourseSeal";
import { getCourseSeal } from "@/lib/server/approvals/seal";
import Link from "next/link";
import { Check, ChevronDown, Circle, CircleCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { shortCodeOf } from "@/lib/dashboard/logic";
import { uiStrings } from "@/lib/i18n-strings";
import { fmt } from "@/lib/quiz/keys";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, objectives, sections, lessons, lessonSkips, objectiveProgress, questions } from "@/lib/server/db/schema";
import { getCompanyMembership } from "@/lib/server/company/access";
import { listModulesForPath } from "@/lib/server/company/modules";
import { CompanyModulesSection } from "@/components/CompanyModulesSection";
import { CourseOverviewView } from "@/components/CourseOverviewView";
import { courseOverviewSchema } from "@/lib/course-overview";
import { getCourseScope } from "@/lib/server/course-overview/service";
import { getServerLocale } from "@/lib/server/locale";
import { RemediationService } from "@/lib/server/remediation/service";
import { getStudyProfile } from "@/lib/server/study/profile";
import {
  peekActiveOrTodaySession,
  getTopWeakObjectives,
  getSessionCategoryBreakdown,
  getSessionRecommendationFeedback,
} from "@/lib/server/study/session-service";
import { getDueReviewCount } from "@/lib/server/review/service";
import { getReadiness } from "@/lib/server/readiness/service";
import type { ReadinessResult } from "@/lib/server/readiness/engine";
import { getRemainingWorkload } from "@/lib/server/study/workload";
import { remainingNeededMinutes } from "@/lib/study/time-outlook";
import { StudyGoalPanel, type StudyGoalState } from "@/components/StudyGoalPanel";
import { TodayDashboard, type TodayDashboardData } from "@/components/TodayDashboard";
import { isDeescalated } from "@/lib/server/engagement/service";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { getProgressView, type ProgressView } from "@/lib/server/progress/snapshots";
import { ProgressReviewCard } from "@/components/ProgressReviewCard";
import { getLearningContext } from "@/lib/server/study/learning-context";
import { StartSessionPicker } from "@/components/StartSessionPicker";
import { CourseSources } from "@/components/CourseSources";
import { ExamDateInline } from "@/components/ExamDateInline";
import { FeedbackButton } from "@/components/FeedbackButton";
import { WeaknessRadar } from "@/components/WeaknessRadar";
import { getWeaknessRadar } from "@/lib/server/weakness/radar";
import { getChapterOverview } from "@/lib/server/chapters/service";
import { getCourseSources } from "@/lib/server/sources/course-sources";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getPreAssessmentRecord, shouldOfferPreAssessment } from "@/lib/server/pre-assessment/service";
import { completedSectionIds } from "@/lib/server/sections/completed";
import { SelfAssessmentCard } from "@/components/SelfAssessmentCard";
import { getSelfAssessment, type SelfAssessmentTopic } from "@/lib/server/psrp/self-assessment";
import { ReadinessCard } from "@/components/ReadinessCard";

interface ProgressData {
  [key: string]: { masteryScore: number; status: string };
}

/** Eine Simulation ist ein Codeblock ```simulation (bzw. ~~~simulation); das Wort allein im Text zählt nicht. */
const SIMULATION_FENCE = "(`{3,}|~{3,}) *simulation";

export default async function CertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
  const db = getDb();

  const certRows = await db
    .select()
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);

  if (!certRows.length) notFound();
  const cert = certRows[0];

  const allDomains = await db
    .select()
    .from(domains)
    .where(eq(domains.certificationId, cert.id))
    .orderBy(domains.orderNum);

  const domainIds = allDomains.map((d) => d.id);
  const allObjectives =
    domainIds.length > 0
      ? await db.select().from(objectives).where(inArray(objectives.domainId, domainIds))
      : [];

  const objectiveIds = allObjectives.map((o) => o.id);
  const allSections =
    objectiveIds.length > 0
      ? await db
          .select()
          .from(sections)
          .where(inArray(sections.objectiveId, objectiveIds))
          .orderBy(sections.orderNum)
      : [];

  const sectionIds = allSections.map((section) => section.id);
  // Gibt es Merkzettel in diesem Kurs? Dann steht oben der Link zur Sammelseite.
  const [withCheatSheet] =
    sectionIds.length > 0
      ? await db.select({ id: lessons.id }).from(lessons).where(and(inArray(lessons.sectionId, sectionIds), isNotNull(lessons.cheatSheet))).limit(1)
      : [];
  // Gibt es Simulationen? Dann führt oben ein Link zur Simulations-Übersicht.
  const [withSimulations] =
    sectionIds.length > 0
      ? await db.select({ id: lessons.id }).from(lessons).where(and(inArray(lessons.sectionId, sectionIds), sql`${lessons.content}::text ~ ${SIMULATION_FENCE}`)).limit(1)
      : [];
  const lessonRows =
    sectionIds.length > 0
      ? await db
          .select({ sectionId: lessons.sectionId })
          .from(lessons)
          .where(inArray(lessons.sectionId, sectionIds))
      : [];
  const sectionsWithLessons = new Set(lessonRows.map((lesson) => lesson.sectionId));

  const [session, locale] = await Promise.all([auth(), getServerLocale()]);

  // Einstufungstest: einmalig direkt nach der Kurswahl, bevor das erste Kapitel beginnt (nur Lernende, solange noch nichts gelernt wurde).
  let preAssessment: Awaited<ReturnType<typeof getPreAssessmentRecord>> = null;
  if (session?.user?.id) {
    const me = await getCurrentUser();
    if (me?.role === "learner" && (await shouldOfferPreAssessment(me.id, cert.id))) redirect(`/cert/${slug}/pre-assessment`);
    preAssessment = await getPreAssessmentRecord(session.user.id, cert.id);
  }

  // Interne Lernpfade können ohne Lektionstests und/oder Abschlussprüfung bestehen („reine Absolvierung“).
  const quizzes = cert.includeSectionQuizzes;
  const hasExam = cert.includeFinalExam;
  // Eine Lektion gilt als erledigt, wenn die Person sie durchgearbeitet hat („Lektion abschließen“; alte Lektionstests zählen mit).
  const completedSections = session?.user?.id && sectionIds.length > 0 ? await completedSectionIds(session.user.id, sectionIds) : new Set<string>();
  // Kapitel: Lektionen, Pool-Größe und Ergebnis im Kapitel-Quiz („Sitzt das?“ am Kapitelende).
  const chapterByDomain = new Map((session?.user?.id ? await getChapterOverview(session.user.id, cert.id).catch(() => []) : []).map((c) => [c.domainId, c]));

  // Einstiegstest (Kapitel testen): nur mit Lektionstests und für Domains, deren Lernziele Fragen haben; übersprungene Lektionen anzeigen.
  const skippedSections = new Set<string>();
  const domainsWithQuestions = new Set<string>();
  if (session?.user?.id && quizzes) {
    if (sectionIds.length > 0) {
      const skips = await db
        .select({ sectionId: lessonSkips.sectionId })
        .from(lessonSkips)
        .where(and(eq(lessonSkips.userId, session.user.id), inArray(lessonSkips.sectionId, sectionIds)));
      skips.forEach((s) => skippedSections.add(s.sectionId));
    }
    if (objectiveIds.length > 0) {
      const withQuestions = await db
        .selectDistinct({ objectiveId: questions.objectiveId })
        .from(questions)
        .where(and(inArray(questions.objectiveId, objectiveIds), eq(questions.stale, false), eq(questions.probeOnly, false)));
      const objectiveHasQuestions = new Set(withQuestions.map((q) => q.objectiveId));
      allObjectives.filter((o) => objectiveHasQuestions.has(o.id)).forEach((o) => domainsWithQuestions.add(o.domainId));
    }
  }

  // Fetch progress data if user is authenticated
  let progressData: ProgressData = {};
  let needsRemediation: Array<{ objectiveId: string; objectiveTitle: string }> = [];
  let studyGoal: StudyGoalState | null = null;
  let neededMinutes = 0;
  let todayDashboard: TodayDashboardData | null = null;
  let readiness: ReadinessResult | null = null;
  let learningIntro = { firstSession: false, offerCheckin: true };
  let learningWelcomeBack = false;
  let energyModesOn = false;
  let progressView: ProgressView | null = null;
  let deescalatedNow = false;
  let selfAssessment: SelfAssessmentTopic[] = [];
  if (session?.user?.id) {
    selfAssessment = await getSelfAssessment(session.user.id, cert.id).catch(() => []);
    const [
      progress,
      remediationTargets,
      studyProfile,
      sessionSummary,
      dueCount,
      learning,
      weakObjectives,
      readinessResult,
    ] = await Promise.all([
      db.select().from(objectiveProgress).where(eq(objectiveProgress.userId, session.user.id)),
      RemediationService.findObjectivesNeedingRemediation(session.user.id),
      getStudyProfile(session.user.id, cert.id),
      // R2 (neue Roadmap-Fassung): liest die aktuell gültige Session, baut
      // aber KEINE neue - ohne gültige Session zeigt die Seite unten
      // stattdessen den Zeitbudget-Picker ("2, 5, 10 oder 20 Minuten" als
      // primäre Session-Eingabe statt eines stillen Auto-Baus).
      peekActiveOrTodaySession(session.user.id, cert.id),
      getDueReviewCount(session.user.id, cert.id),
      getLearningContext(session.user.id),
      getTopWeakObjectives(session.user.id, cert.id),
      // R2.5: ganzheitliche Readiness (nicht nur der letzte Exam-Versuch).
      getReadiness(session.user.id, cert.id),
    ]);
    readiness = readinessResult;
    learningIntro = { firstSession: learning.intro.firstSession, offerCheckin: learning.intro.offerCheckin };
    learningWelcomeBack = learning.welcomeBack;
    energyModesOn = isFeatureEnabled("energy_modes", session.user.id);
    progressView = await getProgressView(session.user.id, cert.id).catch(() => null);
    deescalatedNow = await isDeescalated(session.user.id).catch(() => false);
    progressData = Object.fromEntries(
      progress.map((p) => [p.objectiveId, { masteryScore: Number(p.masteryScore), status: p.status }])
    );
    // Only show objectives that belong to this certification
    const certObjectiveIds = new Set(allObjectives.map((o) => o.id));
    needsRemediation = remediationTargets.filter((r) => certObjectiveIds.has(r.objectiveId));
    studyGoal = studyProfile
      ? {
          examDate: studyProfile.examDate ? studyProfile.examDate.toISOString().slice(0, 10) : null,
          dailyGoalType: studyProfile.dailyGoalType,
          dailyGoalValue: studyProfile.dailyGoalValue,
          activeDays: studyProfile.activeDays,
          preferredLocale: studyProfile.preferredLocale,
          lightWeekdays: studyProfile.lightWeekdays,
        }
      : null;
    // „Reicht die Zeit?“ im Lernziel: geschätzter Restaufwand (Lektionen lesen, neue Fragen üben).
    neededMinutes = remainingNeededMinutes(await getRemainingWorkload(session.user.id, cert.id).catch(() => ({ lessonMinutes: 0, unseenQuestions: 0 })));
    if (sessionSummary) {
      // R2 (neue Roadmap-Fassung): "Empfehlungen mit Gründen anzeigen" +
      // "Nutzerfeedback auf Empfehlungen erfassen" - beide hängen an der
      // konkreten Session, daher erst nachgeladen, sobald deren ID bekannt ist.
      const [categoryBreakdown, feedback] = await Promise.all([
        getSessionCategoryBreakdown(sessionSummary.id),
        getSessionRecommendationFeedback(sessionSummary.id),
      ]);
      todayDashboard = {
        sessionId: sessionSummary.id,
        certificationId: cert.id,
        sessionStatus: sessionSummary.status,
        estimatedMinutes: sessionSummary.estimatedMinutes,
        dueCount,
        streak: learning.preferences.showStreak ? learning.streak : 0,
        weekly: { days: learning.weekly.daysLearned, goal: learning.weekly.goal },
        welcomeBack: learning.welcomeBack,
        dailyGoalType: sessionSummary.goalType,
        dailyGoalValue: sessionSummary.goalValue,
        weakObjectives,
        categoryBreakdown,
        feedback,
        isComeback: sessionSummary.isComeback,
        paused: sessionSummary.paused,
      };
    }
  }

  // Calculate domain mastery
  const domainMastery: { [key: string]: { mastery: number; strong: number; ok: number; total: number } } = {};
  allDomains.forEach((domain) => {
    const domainObjs = allObjectives.filter((o) => o.domainId === domain.id);
    const strong = domainObjs.filter((o) => progressData[o.id]?.status === "STRONG").length;
    const ok = domainObjs.filter((o) => progressData[o.id]?.status === "OK").length;
    const total = domainObjs.length;
    const mastery = total > 0 ? Math.round(((strong * 100 + ok * 50) / (total * 100)) * 100) : 0;
    domainMastery[domain.id] = { mastery, strong, ok, total };
  });

  // Firmenmodule: nur für Mitglieder der Firma, der sie gehören (siehe lib/server/company/modules.ts)
  const companyMembership = session?.user?.id ? await getCompanyMembership(session.user.id) : null;
  const companyModules = companyMembership
    ? await listModulesForPath({
        organizationId: companyMembership.organizationId,
        userId: companyMembership.userId,
        role: companyMembership.role,
        certificationId: cert.id,
      })
    : [];

  // Kursbeschreibung: ausgeklappt, solange die Person noch nichts gelernt hat, sonst eingeklappt.
  const parsedOverview = courseOverviewSchema.safeParse(cert.overview);
  const overview = parsedOverview.success ? parsedOverview.data : null;
  const overviewScope = overview ? await getCourseScope(cert.id) : undefined;
  // Siegel „Fachlich geprüft von …“: nur allgemeine Kurse mit Freigabe; interne Lernpfade nie.
  const seal = cert.kind === "general" ? await getCourseSeal(cert.id).catch(() => null) : null;
  const courseSources = await getCourseSources(cert.id).catch(() => []);
  const weaknessRadar = session?.user?.id && quizzes ? await getWeaknessRadar(session.user.id, cert.id).catch(() => null) : null;
  const hasStarted = Object.keys(progressData).some((k) => allObjectives.some((o) => o.id === k));

  const c = uiStrings[locale].course_page;
  const sideColumn = Boolean(session && quizzes);
  const statusLabel = (status?: string) => (status === "STRONG" ? c.statusStrong : status === "OK" ? c.statusOk : c.statusLearning);
  const statusTone = (status?: string) => (status === "STRONG" ? "success" : status === "OK" ? "info" : "neutral");
  const tabClass = "-mb-px inline-flex h-11 shrink-0 items-center border-b-2 border-transparent px-1 text-sm font-medium whitespace-nowrap text-subtle hover:text-foreground";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border-strong bg-accent-soft font-mono text-body font-semibold text-link sm:flex" aria-hidden="true">
            {shortCodeOf(cert.name, cert.shortCode)}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-semibold tracking-title break-words sm:text-title">{cert.name}</h1>
            <p className="mt-1 text-sm text-subtle">
              <span className="font-mono">{cert.examName} {cert.examVersion}</span>
              {session && quizzes && allSections.length > 0 ? ` · ${fmt(c.lessonsDone, { x: completedSections.size, y: allSections.length })}` : ""}
            </p>
            {seal && <CourseSeal seal={seal} locale={locale} field={cert.name} className="mt-3 max-w-xl" />}
          </div>
        </div>
        {/* Hauptaktion ist die Tages-Session darunter; hier nur der Weg zur Abschlussprüfung. */}
        {session && quizzes && hasExam && (
          <Button asChild variant="secondary" className="shrink-0 self-start">
            <Link href={`/cert/${slug}/final-exam`}>{c.finalExam}</Link>
          </Button>
        )}
      </header>

      {session && (withCheatSheet || withSimulations || hasExam || quizzes || weaknessRadar) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border">
          <nav aria-label={c.tabsLabel} className="-mb-px flex min-w-0 gap-5 overflow-x-auto">
            <Link href={`/cert/${slug}`} aria-current="page" className={cn(tabClass, "border-accent text-foreground")}>{c.tabOverview}</Link>
            {hasExam && <Link href={`/cert/${slug}/history`} className={tabClass}>{c.tabExams}</Link>}
            {withCheatSheet && <Link href={`/cert/${slug}/cheatsheets`} className={tabClass} data-testid="cheatsheets-link">{c.tabCheatsheets}</Link>}
            {withSimulations && <Link href={`/cert/${slug}/simulations`} className={tabClass} data-testid="simulations-link">{c.tabSimulations}</Link>}
            {quizzes && <Link href={`/cert/${slug}/offline`} className={tabClass}>{c.tabOffline}</Link>}
          </nav>
          {weaknessRadar && <div className="pb-2"><WeaknessRadar radar={weaknessRadar} slug={slug} locale={locale} /></div>}
        </div>
      )}

      {!session && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4">
          <p className="text-sm text-muted">{c.signInHint}</p>
          <Button asChild size="sm"><Link href="/login">{c.signIn}</Link></Button>
        </div>
      )}

      {companyMembership && companyModules.length > 0 && (
        <CompanyModulesSection modules={companyModules} companyName={companyMembership.organizationName} locale={locale} />
      )}

      <div className={cn("grid items-start gap-6", sideColumn && "xl:grid-cols-3")}>
        <div className={cn("flex min-w-0 flex-col gap-6", sideColumn && "xl:col-span-2")}>
          {session && quizzes && todayDashboard && <TodayDashboard certSlug={slug} locale={locale} data={todayDashboard} />}
          {session && quizzes && !todayDashboard && (
            <StartSessionPicker certSlug={slug} certificationId={cert.id} locale={locale} intro={learningIntro} welcomeBack={learningWelcomeBack} energyModes={energyModesOn} deescalated={deescalatedNow} />
          )}

          {quizzes && needsRemediation.length > 0 && (
            <section aria-labelledby="remediation-title" className="flex flex-col gap-3" data-testid="remediation-list">
              <div>
                <h2 id="remediation-title" className="text-lg font-semibold">{c.remediationTitle}</h2>
                <p className="text-meta text-subtle">{fmt(c.remediationSub, { n: needsRemediation.length })}</p>
              </div>
              <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
                {needsRemediation.map((r) => (
                  <li key={r.objectiveId} className="border-b border-border-subtle last:border-0">
                    <Link href={`/cert/${slug}/remediation/${r.objectiveId}`} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm hover:bg-surface-2">
                      <span className="flex min-w-0 items-center gap-3">
                        <TriangleAlert className="h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
                        <span className="min-w-0 font-medium">{r.objectiveTitle}</span>
                      </span>
                      <span className="shrink-0 font-medium text-link">{c.practiceTarget} →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {session && quizzes && progressView && <ProgressReviewCard review={progressView.review} outlook={progressView.outlook} series={progressView.series} locale={locale} certSlug={slug} />}

          {preAssessment?.status === "completed" && preAssessment.domainResults && (
            <details className="rounded-2xl border border-border bg-surface p-5" data-testid="pre-assessment-card">
              <summary className="cursor-pointer text-sm font-semibold">
                {fill(c_certIdPage(locale).yourEntryAssessment0Of, preAssessment.correctCount, preAssessment.totalCount)}
              </summary>
              <ul className="mt-3 flex flex-col gap-1.5 text-sm text-text-2">
                {preAssessment.domainResults.map((d) => (
                  <li key={d.domainId} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{d.name}</span>
                    <span className="shrink-0 tabular-nums text-subtle">{d.correct} / {d.total}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {allSections.length === 0 && (
            <Callout tone="mistake" title={c_certIdPage(locale).noLearningContentYet}>
              <p>
                {c_certIdPage(locale).learningContentHasNotBeen}{" "}
                {c_certIdPage(locale).adminShowsTheContentStatus}
              </p>
              {session && (
                <Link href={`/admin/certifications/${slug}`} className="mt-2 inline-block text-sm font-medium text-link hover:underline">
                  {c_certIdPage(locale).openAdmin}
                </Link>
              )}
            </Callout>
          )}

          {session && !quizzes && allSections.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-sm" data-testid="lesson-progress">
              <p className="font-medium">
                {fill(c_certIdPage(locale).n0Of1LessonsCompleted, completedSections.size, allSections.length)}
              </p>
              <ProgressBar value={allSections.length ? (completedSections.size / allSections.length) * 100 : 0} className="mt-2" label={c.chapters} />
              <p className="mt-2 text-xs text-muted">
                {c_certIdPage(locale).thisLearningPathHasNo}
              </p>
            </div>
          )}

          {allDomains.length > 0 && (
            <section aria-labelledby="chapters-title" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="chapters-title" className="text-lg font-semibold">{c.chapters}</h2>
                {session && <p className="text-meta text-subtle">{fmt(c.chaptersSub, { done: completedSections.size, total: allSections.length })}</p>}
              </div>
              {allDomains.map((domain, di) => {
                const domainObjectives = allObjectives.filter((o) => o.domainId === domain.id);
                const domainSectionIds = allSections.filter((sec) => domainObjectives.some((o) => o.id === sec.objectiveId)).map((sec) => sec.id);
                const domainDone = domainSectionIds.filter((id) => completedSections.has(id)).length;
                const allDone = domainSectionIds.length > 0 && domainDone === domainSectionIds.length;
                const { mastery } = domainMastery[domain.id] || { mastery: 0 };
                const chapter = chapterByDomain.get(domain.id);
                return (
                  <details key={domain.id} open className="group overflow-hidden rounded-2xl border border-border bg-surface">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
                      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", allDone ? "bg-success text-on-success" : domainDone > 0 ? "border-2 border-accent text-link" : "border-2 border-border-strong text-subtle")} aria-hidden="true">
                        {allDone ? <Check className="h-4 w-4" /> : di + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold break-words">
                          {domain.name}
                          {domain.weightPercent && <span className="ml-2 text-sm font-normal text-subtle">({Number(domain.weightPercent).toLocaleString(locale === "de" ? "de-DE" : "en-GB")} %)</span>}
                        </span>
                        <span className="block text-xs text-subtle tabular-nums">
                          {fmt(c.lessonsDone, { x: domainDone, y: domainSectionIds.length })}
                          {session && quizzes ? ` · ${fmt(c.mastery, { n: mastery })}` : ""}
                        </span>
                      </span>
                      {session && quizzes && <ProgressBar value={mastery} tone={mastery >= 70 ? "success" : "accent"} className="hidden w-24 sm:block" label={fmt(c.mastery, { n: mastery })} />}
                      <ChevronDown className="h-4 w-4 shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="flex flex-col gap-4 border-t border-border-subtle px-5 py-4">
                      {session && quizzes && (domainsWithQuestions.has(domain.id) || chapter?.poolSize) ? (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          {domainsWithQuestions.has(domain.id) && (
                            <Link href={`/cert/${slug}/placement/${domain.id}`} className="text-sm text-link hover:underline" data-testid="placement-entry">{c.placement}</Link>
                          )}
                          {chapter?.poolSize ? (
                            <Link href={`/cert/${slug}/chapter/${domain.id}/quiz`} className={cn("inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium", chapter.quizPassed ? "border-success-border bg-success-soft text-success-text" : "border-accent-border bg-accent-soft text-link hover:border-accent")} data-testid="chapter-quiz-entry">
                              {chapter.quizPassed ? fmt(c.chapterQuizPassed, { n: Math.round(chapter.bestScore ?? 0) }) : c.chapterQuiz}
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                      {domainObjectives.map((obj) => {
                        const objSections = allSections.filter((sec) => sec.objectiveId === obj.id);
                        const progress = progressData[obj.id];
                        return (
                          <div key={obj.id} className="flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium">
                                <span className="mr-2 font-mono text-xs text-faint">{obj.code}</span>
                                {obj.title}
                              </p>
                              {session && quizzes && progress && (
                                <Badge tone={statusTone(progress.status)} className="shrink-0 tabular-nums">{statusLabel(progress.status)} · {progress.masteryScore} %</Badge>
                              )}
                            </div>
                            <ul className="flex flex-col gap-1.5">
                              {objSections.map((section) => {
                                const isReady = sectionsWithLessons.has(section.id);
                                const done = completedSections.has(section.id);
                                const content = (
                                  <>
                                    <span className="flex min-w-0 items-center gap-2.5">
                                      {done ? (
                                        <CircleCheck className="h-4 w-4 shrink-0 text-success-text" aria-label={c.completed} />
                                      ) : (
                                        <Circle className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                                      )}
                                      <span className="min-w-0">{section.title[locale]}</span>
                                      {skippedSections.has(section.id) && (
                                        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-subtle" data-testid="skipped-badge">{c.skipped}</span>
                                      )}
                                    </span>
                                    <span className="shrink-0 text-xs text-faint">
                                      {isReady ? (section.estimatedMinutes ? fmt(c.minutes, { n: section.estimatedMinutes }) : null) : c.contentMissing}
                                    </span>
                                  </>
                                );
                                return (
                                  <li key={section.id}>
                                    {isReady ? (
                                      <Link href={`/cert/${slug}/section/${section.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm hover:border-accent-border">
                                        {content}
                                      </Link>
                                    ) : (
                                      <div className="flex min-h-11 cursor-not-allowed items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2 text-sm opacity-60">{content}</div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </section>
          )}
        </div>

        {sideColumn && (
          <aside aria-label={c.yourProgress} className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6">
            <ExamDateInline certId={cert.id} locale={locale} goal={studyGoal} />
            {readiness && <ReadinessCard locale={locale} readiness={readiness} />}
            <StudyGoalPanel certId={cert.id} locale={locale} initialGoal={studyGoal} neededMinutes={neededMinutes} />
            <SelfAssessmentCard locale={locale} topics={selfAssessment} />
          </aside>
        )}
      </div>

      {overview && (
        <details open={!hasStarted} className="rounded-2xl border border-border bg-surface p-5" data-testid="course-description">
          <summary className="cursor-pointer text-sm font-semibold">{c.aboutCourse}</summary>
          <div className="mt-3">
            <CourseOverviewView overview={overview} scope={overviewScope} locale={locale} />
          </div>
        </details>
      )}

      <CourseSources sources={courseSources} locale={locale} />

      {session && cert.kind === "general" && <FeedbackButton certificationId={cert.id} />}
    </div>
  );
}
