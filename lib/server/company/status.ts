import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyAssignments,
  practiceTaskSubmissions,
  practiceTasks,
  users,
  type AssignmentStatus,
  type CourseKind,
} from "@/lib/server/db/schema";

/**
 * Das ist ALLES, was der Arbeitgeber über Lernende erfährt: wer, welcher
 * Lernpfad, Status, Zuweisungs-/Fälligkeits-/Abschlussdatum. Keine Quiz-
 * Antworten, keine Mastery, keine Remediation, keine Zeiten (Leitplanke
 * „Arbeitgeber sieht nur Status“). Neue Felder hier sind eine bewusste
 * Entscheidung - der Test in status.test.ts hält die Liste fest.
 */
export const COMPANY_STATUS_FIELDS = [
  "assignmentId",
  "memberId",
  "memberName",
  "memberEmail",
  "learningPath",
  "learningPathKind",
  "status",
  "assignedAt",
  "dueAt",
  "completedAt",
  "practiceConfirmed",
  "practiceTotal",
] as const;

export type CompanyStatusEntry = {
  assignmentId: string;
  memberId: string;
  memberName: string | null;
  memberEmail: string;
  learningPath: string;
  learningPathKind: CourseKind;
  status: AssignmentStatus;
  assignedAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
  /** Praxisaufgaben dieses Lernpfads, die der Mentor bestätigt hat, und wie viele es gibt (nur Zahlen, keine Inhalte). */
  practiceConfirmed: number;
  practiceTotal: number;
};

/** Statusübersicht einer Organisation. `organizationId` MUSS aus der Mitgliedschaft stammen (guard.ts). */
export async function listCompanyStatus(organizationId: string): Promise<CompanyStatusEntry[]> {
  return getDb()
    .select({
      assignmentId: companyAssignments.id,
      memberId: companyAssignments.userId,
      memberName: users.name,
      memberEmail: users.email,
      learningPath: certifications.name,
      learningPathKind: certifications.kind,
      status: companyAssignments.status,
      assignedAt: companyAssignments.assignedAt,
      dueAt: companyAssignments.dueAt,
      completedAt: companyAssignments.completedAt,
      practiceTotal: sql<number>`(select count(*)::int from ${practiceTasks} t where t.organization_id = ${companyAssignments.organizationId} and t.certification_id = ${companyAssignments.certificationId} and t.archived_at is null)`,
      practiceConfirmed: sql<number>`(select count(*)::int from ${practiceTaskSubmissions} s join ${practiceTasks} t on t.id = s.task_id where t.organization_id = ${companyAssignments.organizationId} and t.certification_id = ${companyAssignments.certificationId} and t.archived_at is null and s.user_id = ${companyAssignments.userId} and s.status = 'confirmed')`,
    })
    .from(companyAssignments)
    .innerJoin(users, eq(users.id, companyAssignments.userId))
    .innerJoin(certifications, eq(certifications.id, companyAssignments.certificationId))
    .where(eq(companyAssignments.organizationId, organizationId))
    .orderBy(asc(companyAssignments.assignedAt), asc(users.email));
}
