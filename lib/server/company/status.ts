import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyAssignments,
  users,
  type AssignmentStatus,
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
  "status",
  "assignedAt",
  "dueAt",
  "completedAt",
] as const;

export type CompanyStatusEntry = {
  assignmentId: string;
  memberId: string;
  memberName: string | null;
  memberEmail: string;
  learningPath: string;
  status: AssignmentStatus;
  assignedAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
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
      status: companyAssignments.status,
      assignedAt: companyAssignments.assignedAt,
      dueAt: companyAssignments.dueAt,
      completedAt: companyAssignments.completedAt,
    })
    .from(companyAssignments)
    .innerJoin(users, eq(users.id, companyAssignments.userId))
    .innerJoin(certifications, eq(certifications.id, companyAssignments.certificationId))
    .where(eq(companyAssignments.organizationId, organizationId))
    .orderBy(asc(companyAssignments.assignedAt), asc(users.email));
}
