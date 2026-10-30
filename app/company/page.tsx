export const dynamic = "force-dynamic";

import { c_companyPage } from "@/lib/i18n/components/companyPage";
import { type CompanyTab } from "@/components/CompanyTabs";
import { CompanyPageHeading } from "@/components/company/CompanyPageHeading";
import { uiStrings } from "@/lib/i18n-strings";
import { fmt } from "@/lib/quiz/keys";
import { AiSettingsPanel } from "@/components/AiSettingsPanel";
import { CompanyOverview } from "@/components/company/CompanyOverview";
import { daysSince, overviewTotals as computeOverviewTotals } from "@/lib/company/overview";
import { listCourseGroups } from "@/lib/server/company/course-groups";
import { CourseRequestsPanel } from "@/components/CourseRequestsPanel";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { CompanyModulesPanel } from "@/components/CompanyModulesPanel";
import { DepartmentsPanel } from "@/components/DepartmentsPanel";
import { listDepartments, listMembersWithDepartment } from "@/lib/server/company/departments";
import { listCheatSheetStatus } from "@/lib/server/internal-courses/cheat-sheets";
import { SsoPanel } from "@/components/SsoPanel";
import { getSsoView } from "@/lib/server/company/sso";
import { MandatoryRulesPanel } from "@/components/MandatoryRulesPanel";
import { listCatalogCoursesForRules, listMandatoryRules } from "@/lib/server/company/mandatory";
import { OnboardingsPanel } from "@/components/OnboardingsPanel";
import { listOnboardingPlans } from "@/lib/server/company/onboardings";
import { MentorRequestsPanel } from "@/components/MentorRequestsPanel";
import { listOpenMentorRequests, mentorRequestStats } from "@/lib/server/company/mentor-requests";
import { PracticeTasksPanel } from "@/components/PracticeTasksPanel";
import { FrameworkGoalsPanel } from "@/components/FrameworkGoalsPanel";
import { listFrameworkGoalsForOrg } from "@/lib/server/company/framework-goals";
import { InternalCoursesPanel } from "@/components/InternalCoursesPanel";
import { InvitationsPanel } from "@/components/InvitationsPanel";
import { ASSIGN_ROLES, STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { getAiSettings, resolveAiAccess } from "@/lib/server/company/ai-settings";
import { isOverdue, listAssignableLearningPaths, listAssignableMembers } from "@/lib/server/company/assignments";
import { listCourseRequests, listRequestableCourses } from "@/lib/server/company/course-requests";
import { listModulesForOrg, listResponsibleCandidates } from "@/lib/server/company/modules";
import { listObjectivesForPaths, listPracticeTasksForOrg, listSectionsForPaths } from "@/lib/server/company/practice-tasks";
import { listInternalCourseJobs, listInternalCourses } from "@/lib/server/company/internal-courses-list";
import { listCompanyDocuments } from "@/lib/server/company/documents";
import { requireCompanyPage } from "@/lib/server/company/guard";
import { listCompanyStatus } from "@/lib/server/company/status";
import { listPendingInvitations } from "@/lib/server/company/invitations";
import { isMailConfigured } from "@/lib/server/mail/config";
import { getServerLocale } from "@/lib/server/locale";
import type { CompanyRole } from "@/lib/server/db/schema";

const ROLE_LABELS: Record<CompanyRole, { de: string; en: string }> = {
  company_admin: { de: "Firmen-Admin", en: "Company admin" },
  mentor: { de: "Mentor", en: "Mentor" },
  learner: { de: "Lernender", en: "Learner" },
};

/**
 * Firmenbereich: Lernpfade zuweisen und Status ansehen (nur Status, Datum, Frist), Einladungen für den
 * Firmen-Admin. Die Organisation kommt immer aus der Mitgliedschaft (guard.ts).
 */
export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const [{ tab: tabParam }, membership, locale] = await Promise.all([
    searchParams,
    requireCompanyPage(STATUS_VIEW_ROLES, "/company"),
    getServerLocale(),
  ]);
  const de = locale === "de";
  const isAdmin = membership.role === "company_admin";
  const canAssign = ASSIGN_ROLES.includes(membership.role);
  const [courseGroups, entries, members, paths, documents, courseRequests, catalog, internalJobs, internalCourses, aiAccess, practice, modules, responsibleCandidates, onboardingPlans, mandatoryRules, departmentList, departmentMembers, cheatSheetStatus, ruleCatalog] = await Promise.all([
    canAssign ? listCourseGroups(membership.organizationId) : [],
    listCompanyStatus(membership.organizationId),
    canAssign ? listAssignableMembers(membership.organizationId) : [],
    canAssign ? listAssignableLearningPaths(membership.organizationId) : [],
    listCompanyDocuments(membership.organizationId),
    listCourseRequests(membership.organizationId),
    listRequestableCourses(membership.organizationId),
    listInternalCourseJobs(membership.organizationId),
    listInternalCourses(membership.organizationId),
    resolveAiAccess(membership.organizationId),
    listPracticeTasksForOrg(membership.organizationId),
    listModulesForOrg(membership.organizationId),
    listResponsibleCandidates(membership.organizationId),
    canAssign ? listOnboardingPlans(membership.organizationId) : [],
    canAssign ? listMandatoryRules(membership.organizationId) : [],
    canAssign ? listDepartments(membership.organizationId) : [],
    isAdmin ? listMembersWithDepartment(membership.organizationId) : [],
    listCheatSheetStatus(membership.organizationId),
    canAssign ? listCatalogCoursesForRules(membership.organizationId) : [],
  ]);
  const objectivesByPath = await listObjectivesForPaths(paths.map((p) => p.id));
  const sectionsByPath = await listSectionsForPaths(paths.map((p) => p.id));
  const frameworkGoalRows = canAssign ? await listFrameworkGoalsForOrg(membership.organizationId) : [];
  const [mentorRequestRows, mentorStats] = await Promise.all([
    listOpenMentorRequests(membership.organizationId, membership.userId, membership.role),
    isAdmin ? mentorRequestStats(membership.organizationId) : null,
  ]);
  const documentRows = documents.map((d) => ({
    id: d.id,
    title: d.title,
    originalFilename: d.originalFilename,
    sizeBytes: d.sizeBytes,
    pageCount: d.pageCount,
    excludeFromAi: d.excludeFromAi,
    suppressedFindings: d.suppressedFindings,
    createdAt: d.createdAt.toISOString(),
    uploadedByName: d.uploadedByName,
    imageCount: d.imageCount,
  }));
  const requestRows = courseRequests.map((r) => ({
    id: r.id,
    status: r.status,
    statusNote: r.statusNote,
    wishTitle: r.wishTitle,
    wishDescription: r.wishDescription,
    courseName: r.courseName,
    createdAt: r.createdAt.toISOString(),
    events: r.events.map((e) => ({ status: e.status, note: e.note, createdAt: e.createdAt.toISOString() })),
  }));
  const rows = entries.map((e) => ({
    id: e.assignmentId,
    memberName: e.memberName,
    memberEmail: e.memberEmail,
    learningPath: e.learningPath,
    learningPathKind: e.learningPathKind,
    status: e.status,
    assignedAt: e.assignedAt.toISOString(),
    dueAt: e.dueAt?.toISOString() ?? null,
    completedAt: e.completedAt?.toISOString() ?? null,
    overdue: isOverdue(e),
    practiceConfirmed: e.practiceConfirmed,
    practiceTotal: e.practiceTotal,
  }));
  const aiSettings = membership.role === "company_admin" ? await getAiSettings(membership.organizationId) : null;
  // Einladungen verwaltet nur der Firmen-Admin (der Mentor sieht sie nicht).
  const invitations =
    membership.role === "company_admin"
      ? (await listPendingInvitations(membership.organizationId)).map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt.toISOString(),
          createdAt: i.createdAt.toISOString(),
        }))
      : null;

  // Kennzahlen der Übersicht: nur aus Status-Feldern (Leitplanke „Arbeitgeber sieht nur Status“).
  const overviewTotals = computeOverviewTotals(rows, members.length);

  // Reiter: was Aufmerksamkeit braucht, steht als Zahl am Reiter.
  const overdue = rows.filter((r) => r.overdue).length;
  const waitingForReview = internalCourses.filter((c) => c.catalogStatus !== "approved").length + internalJobs.filter((j) => j.active).length;
  const needsAttention = practice.pending.length + mentorRequestRows.length + modules.filter((m) => m.state === "expired").length;
  const tabs: CompanyTab[] = [
    { id: "status", label: c_companyPage(de).results, badge: overdue, badgeTitle: c_companyPage(de).overdue },
    ...(canAssign ? [{ id: "mandatory", label: c_companyPage(de).mandatoryTraining, badge: mandatoryRules.reduce((n, r) => n + r.overdue, 0), badgeTitle: c_companyPage(de).overdue }] : []),
    { id: "paths", label: c_companyPage(de).internalLearning, badge: waitingForReview, badgeTitle: c_companyPage(de).draftsOrJobsInProgress },
    { id: "work", label: c_companyPage(de).tasksModules, badge: needsAttention, badgeTitle: c_companyPage(de).awaitingConfirmationOrExpired },
    ...(canAssign ? [{ id: "onboarding", label: "Onboarding" }] : []),
    { id: "documents", label: c_companyPage(de).documents },
    ...(isAdmin ? [{ id: "team", label: c_companyPage(de).team }] : []),
    ...(isAdmin ? [{ id: "sso", label: c_companyPage(de).signIn }] : []),
  ];
  const requested = Array.isArray(tabParam) ? tabParam[0] : tabParam;
  const active = tabs.some((t) => t.id === requested) ? (requested as string) : "status";

  // Kopf je Reiter: Titel, Beschreibung und was Aufmerksamkeit braucht (früher als Zahl am Reiter).
  const cp = uiStrings[locale].company_page;
  const tabHref = (id: string) => (id === "status" ? "/company" : `/company?tab=${id}`);
  const attentionText: Record<string, string> = { status: cp.attOverdue, mandatory: cp.attMandatory, paths: cp.attPaths, work: cp.attWork };
  const attention = tabs
    .filter((t) => (t.badge ?? 0) > 0 && attentionText[t.id] && (active === "status" || t.id === active))
    .map((t) => ({ label: fmt(attentionText[t.id], { n: t.badge ?? 0 }), href: tabHref(t.id) }));
  const meta: Record<string, { title: string; description: string }> = {
    status: { title: cp.tabStatus, description: cp.tabStatusDesc },
    mandatory: { title: cp.tabMandatory, description: cp.tabMandatoryDesc },
    paths: { title: cp.tabPaths, description: cp.tabPathsDesc },
    work: { title: cp.tabWork, description: cp.tabWorkDesc },
    onboarding: { title: cp.tabOnboarding, description: cp.tabOnboardingDesc },
    documents: { title: cp.tabDocuments, description: cp.tabDocumentsDesc },
    team: { title: cp.tabTeam, description: cp.tabTeamDesc },
    sso: { title: cp.tabSso, description: cp.tabSsoDesc },
  };
  const heading = (
    <CompanyPageHeading
      overline={`${membership.organizationName} · ${fmt(cp.role, { role: ROLE_LABELS[membership.role][locale] })}`}
      title={meta[active].title}
      description={meta[active].description}
      attention={attention}
      attentionLabel={cp.attentionLabel}
    />
  );

  return (
    <div className="flex flex-1 flex-col gap-6">
      {active !== "status" && heading}

      {active === "status" && (
        <CompanyOverview
          heading={heading}
          rows={rows}
          members={members.map((m) => ({ userId: m.userId, name: m.name, email: m.email }))}
          paths={paths}
          groups={courseGroups.map((g) => ({
            id: g.id,
            name: g.name,
            color: g.color,
            items: g.items,
            people: g.people.map((p) => { const m = members.find((x) => x.userId === p.userId); return m?.name ?? m?.email ?? "?"; }),
          }))}
          rules={mandatoryRules.map((r) => ({ id: r.id, learningPath: r.learningPath, assigned: r.assigned, completed: r.completed, overdue: r.overdue, dueInDays: r.dueInDays }))}
          invites={invitations ? invitations.map((i) => ({ id: i.id, email: i.email, daysAgo: daysSince(i.createdAt) })) : null}
          canAssign={canAssign}
          isAdmin={isAdmin}
          totals={overviewTotals}
        />
      )}

      {active === "mandatory" && canAssign && (
        <MandatoryRulesPanel rules={mandatoryRules} paths={paths.map((p) => ({ id: p.id, name: p.name }))} catalog={ruleCatalog} departments={departmentList.map((d) => ({ id: d.id, name: d.name }))} canEdit={isAdmin} locale={locale} />
      )}

      {active === "paths" && (
        <>
          <InternalCoursesPanel
            documents={documents.map((d) => ({ id: d.id, title: d.title, excludeFromAi: d.excludeFromAi }))}
            initialJobs={internalJobs.map((j) => ({ ...j, createdAt: j.createdAt.toISOString() }))}
            initialCourses={internalCourses.map((c) => ({ ...c, approvedAt: c.approvedAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString() }))}
            cheatSheets={cheatSheetStatus.map((c) => ({ certificationId: c.certificationId, lessons: c.lessons, withCheatSheet: c.withCheatSheet, run: c.run ? { status: c.run.status, total: c.run.total, created: c.run.created, skipped: c.run.skipped, failed: c.run.failed, message: c.run.message } : null }))}
            aiConfigured={aiAccess.kind !== "none"}
            locale={locale}
          />
          <CourseRequestsPanel requests={requestRows} catalog={catalog} locale={locale} />
          {aiSettings && <AiSettingsPanel settings={aiSettings} locale={locale} />}
        </>
      )}

      {active === "work" && (
        <>
          <MentorRequestsPanel requests={mentorRequestRows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} stats={mentorStats} locale={locale} />
          <PracticeTasksPanel
            tasks={practice.tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, learningPath: t.learningPath, assignees: t.assignees, submitted: t.submitted, confirmed: t.confirmed, rework: t.rework }))}
            pending={practice.pending.map((p) => ({ ...p, submittedAt: p.submittedAt.toISOString() }))}
            paths={paths.map((p) => ({ id: p.id, name: p.name }))}
            objectivesByPath={objectivesByPath}
            sectionsByPath={sectionsByPath}
            locale={locale}
          />
          {canAssign && <FrameworkGoalsPanel goals={frameworkGoalRows} paths={paths.map((p) => ({ id: p.id, name: p.name }))} objectivesByPath={objectivesByPath} locale={locale} />}
          <CompanyModulesPanel
            modules={modules}
            paths={paths.map((p) => ({ id: p.id, name: p.name }))}
            people={responsibleCandidates}
            currentUserId={membership.userId}
            locale={locale}
          />
        </>
      )}

      {active === "onboarding" && canAssign && (
        <OnboardingsPanel
          plans={onboardingPlans.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            mentor: p.mentor,
            courses: p.courses,
            people: p.people.map((x) => ({ id: x.id, userId: x.userId, name: x.name, email: x.email, status: x.status, coursesDone: x.coursesDone, coursesTotal: x.coursesTotal })),
          }))}
          paths={paths.map((p) => ({ id: p.id, name: p.name }))}
          mentors={responsibleCandidates}
          members={members.map((m) => ({ userId: m.userId, name: m.name, email: m.email }))}
          currentUserId={membership.userId}
          isAdmin={isAdmin}
          locale={locale}
        />
      )}

      {active === "documents" && <DocumentsPanel documents={documentRows} locale={locale} canSuppress={isAdmin} />}

      {active === "sso" && isAdmin && <SsoPanel view={await getSsoView(membership.organizationId)} />}

      {active === "team" && invitations && (
        <>
          <InvitationsPanel invitations={invitations} locale={locale} mailEnabled={isMailConfigured()} />
          <DepartmentsPanel departments={departmentList} members={departmentMembers} locale={locale} />
        </>
      )}
    </div>
  );
}
