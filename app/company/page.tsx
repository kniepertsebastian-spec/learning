export const dynamic = "force-dynamic";

import { AssignmentsPanel } from "@/components/AssignmentsPanel";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { InvitationsPanel } from "@/components/InvitationsPanel";
import { ASSIGN_ROLES, STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { isOverdue, listAssignableLearningPaths, listAssignableMembers } from "@/lib/server/company/assignments";
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
export default async function CompanyPage() {
  const [membership, locale] = await Promise.all([
    requireCompanyPage(STATUS_VIEW_ROLES, "/company"),
    getServerLocale(),
  ]);
  const de = locale === "de";
  const canAssign = ASSIGN_ROLES.includes(membership.role);
  const [entries, members, paths, documents] = await Promise.all([
    listCompanyStatus(membership.organizationId),
    canAssign ? listAssignableMembers(membership.organizationId) : [],
    canAssign ? listAssignableLearningPaths() : [],
    listCompanyDocuments(membership.organizationId),
  ]);
  const documentRows = documents.map((d) => ({
    id: d.id,
    title: d.title,
    originalFilename: d.originalFilename,
    sizeBytes: d.sizeBytes,
    pageCount: d.pageCount,
    excludeFromAi: d.excludeFromAi,
    createdAt: d.createdAt.toISOString(),
    uploadedByName: d.uploadedByName,
  }));
  const rows = entries.map((e) => ({
    id: e.assignmentId,
    memberName: e.memberName,
    memberEmail: e.memberEmail,
    learningPath: e.learningPath,
    status: e.status,
    assignedAt: e.assignedAt.toISOString(),
    dueAt: e.dueAt?.toISOString() ?? null,
    completedAt: e.completedAt?.toISOString() ?? null,
    overdue: isOverdue(e),
  }));
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

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{membership.organizationName}</h1>
        <p className="mt-1 text-sm text-foreground/70">
          {de ? "Deine Rolle: " : "Your role: "}
          <span data-testid="company-role">{ROLE_LABELS[membership.role][locale]}</span>
        </p>
      </div>

      <AssignmentsPanel rows={rows} members={members} paths={paths} locale={locale} />

      <DocumentsPanel documents={documentRows} locale={locale} />

      {invitations && <InvitationsPanel invitations={invitations} locale={locale} mailEnabled={isMailConfigured()} />}
    </div>
  );
}
