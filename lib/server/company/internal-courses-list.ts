import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, courseGenerationJobs, TERMINAL_COURSE_GENERATION_JOB_STATUSES } from "@/lib/server/db/schema";

/** Das sieht die Firma über ihre internen Lernpfade: Stand der Erstellung und der Prüfung, nie Lerninhalte. */
export type InternalCourseJobView = {
  id: string;
  title: string;
  status: string;
  message: string | null;
  errorMessage: string | null;
  active: boolean;
  createdAt: Date;
};

export type InternalCourseView = {
  id: string;
  slug: string;
  name: string;
  catalogStatus: "draft" | "in_review" | "approved";
  includeSectionQuizzes: boolean;
  includeFinalExam: boolean;
  approvedByName: string | null;
  approvedAt: Date | null;
  createdAt: Date;
};

export async function listInternalCourseJobs(organizationId: string, limit = 10): Promise<InternalCourseJobView[]> {
  const rows = await getDb()
    .select({
      id: courseGenerationJobs.id,
      title: courseGenerationJobs.courseTitle,
      status: courseGenerationJobs.status,
      message: courseGenerationJobs.message,
      errorMessage: courseGenerationJobs.errorMessage,
      createdAt: courseGenerationJobs.createdAt,
    })
    .from(courseGenerationJobs)
    .where(eq(courseGenerationJobs.organizationId, organizationId))
    .orderBy(desc(courseGenerationJobs.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, active: !(TERMINAL_COURSE_GENERATION_JOB_STATUSES as string[]).includes(r.status) }));
}

export async function listInternalCourses(organizationId: string): Promise<InternalCourseView[]> {
  return getDb()
    .select({
      id: certifications.id,
      slug: certifications.slug,
      name: certifications.name,
      catalogStatus: certifications.catalogStatus,
      includeSectionQuizzes: certifications.includeSectionQuizzes,
      includeFinalExam: certifications.includeFinalExam,
      approvedByName: certifications.approvedByName,
      approvedAt: certifications.approvedAt,
      createdAt: certifications.createdAt,
    })
    .from(certifications)
    .where(and(eq(certifications.kind, "internal"), eq(certifications.ownerOrganizationId, organizationId)))
    .orderBy(desc(certifications.createdAt));
}
