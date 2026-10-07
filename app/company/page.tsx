export const dynamic = "force-dynamic";

import { CompanyTabs, type CompanyTab } from "@/components/CompanyTabs";
import { AiSettingsPanel } from "@/components/AiSettingsPanel";
import { AssignmentsPanel } from "@/components/AssignmentsPanel";
import { CourseRequestsPanel } from "@/components/CourseRequestsPanel";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { CompanyModulesPanel } from "@/components/CompanyModulesPanel";
import { PracticeTasksPanel } from "@/components/PracticeTasksPanel";
import { InternalCoursesPanel } from "@/components/InternalCoursesPanel";
import { InvitationsPanel } from "@/components/InvitationsPanel";
import { ASSIGN_ROLES, STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { getAiSettings, resolveAiAccess } from "@/lib/server/company/ai-settings";
import { isOverdue, listAssignableLearningPaths, listAssignableMembers } from "@/lib/server/company/assignments";
import { listCourseRequests, listRequestableCourses } from "@/lib/server/company/course-requests";
import { listModulesForOrg, listResponsibleCandidates } from "@/lib/server/company/modules";
import { listPracticeTasksForOrg } from "@/lib/server/company/practice-tasks";
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
  const [entries, members, paths, documents, courseRequests, catalog, internalJobs, internalCourses, aiAccess, practice, modules, responsibleCandidates] = await Promise.all([
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
        }))
      : null;

  // Reiter: was Aufmerksamkeit braucht, steht als Zahl am Reiter.
  const overdue = rows.filter((r) => r.overdue).length;
  const waitingForReview = internalCourses.filter((c) => c.catalogStatus !== "approved").length + internalJobs.filter((j) => j.active).length;
  const needsAttention = practice.pending.length + modules.filter((m) => m.state === "expired").length;
  const tabs: CompanyTab[] = [
    { id: "status", label: de ? "Zuweisungen" : "Assignments", badge: overdue, badgeTitle: de ? "überfällig" : "overdue" },
    { id: "paths", label: de ? "Lernpfade" : "Learning paths", badge: waitingForReview, badgeTitle: de ? "Entwürfe oder Aufträge in Arbeit" : "drafts or jobs in progress" },
    { id: "work", label: de ? "Aufgaben & Module" : "Tasks & modules", badge: needsAttention, badgeTitle: de ? "wartet auf Bestätigung oder abgelaufen" : "awaiting confirmation or expired" },
    { id: "documents", label: de ? "Dokumente" : "Documents" },
    ...(isAdmin ? [{ id: "team", label: de ? "Team" : "Team" }] : []),
  ];
  const requested = Array.isArray(tabParam) ? tabParam[0] : tabParam;
  const active = tabs.some((t) => t.id === requested) ? (requested as string) : "status";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{membership.organizationName}</h1>
        <p className="mt-1 text-sm text-foreground/70">
          {de ? "Deine Rolle: " : "Your role: "}
          <span data-testid="company-role">{ROLE_LABELS[membership.role][locale]}</span>
        </p>
      </div>

      <CompanyTabs tabs={tabs} active={active} ariaLabel={de ? "Bereiche des Firmenbereichs" : "Company area sections"} />

      {active === "status" && <AssignmentsPanel rows={rows} members={members} paths={paths} locale={locale} />}

      {active === "paths" && (
        <>
          <InternalCoursesPanel
            documents={documents.map((d) => ({ id: d.id, title: d.title, excludeFromAi: d.excludeFromAi }))}
            initialJobs={internalJobs.map((j) => ({ ...j, createdAt: j.createdAt.toISOString() }))}
            initialCourses={internalCourses.map((c) => ({ ...c, approvedAt: c.approvedAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString() }))}
            aiConfigured={aiAccess.kind !== "none"}
            locale={locale}
          />
          <CourseRequestsPanel requests={requestRows} catalog={catalog} locale={locale} />
          {aiSettings && <AiSettingsPanel settings={aiSettings} locale={locale} />}
        </>
      )}

      {active === "work" && (
        <>
          <PracticeTasksPanel
            tasks={practice.tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, learningPath: t.learningPath, assignees: t.assignees, submitted: t.submitted, confirmed: t.confirmed, rework: t.rework }))}
            pending={practice.pending.map((p) => ({ ...p, submittedAt: p.submittedAt.toISOString() }))}
            paths={paths.map((p) => ({ id: p.id, name: p.name }))}
            locale={locale}
          />
          <CompanyModulesPanel
            modules={modules}
            paths={paths.map((p) => ({ id: p.id, name: p.name }))}
            people={responsibleCandidates}
            currentUserId={membership.userId}
            locale={locale}
          />
        </>
      )}

      {active === "documents" && <DocumentsPanel documents={documentRows} locale={locale} canSuppress={isAdmin} />}

      {active === "team" && invitations && <InvitationsPanel invitations={invitations} locale={locale} mailEnabled={isMailConfigured()} />}
    </div>
  );
}
