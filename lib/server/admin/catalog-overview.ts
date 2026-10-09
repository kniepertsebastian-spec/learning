import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { contentReports, courseGenerationJobs } from "@/lib/server/db/schema";
import { countOpenCourseRequests } from "@/lib/server/admin/course-requests";
import { listCategories, type CourseCategory } from "@/lib/server/catalog/categories";
import { getCertificationsWithStats, type CertificationStats } from "@/lib/server/admin/stats";

export interface CatalogOverview {
  certifications: CertificationStats[];
  categories: CourseCategory[];
  totals: { certifications: number; lessons: number; questions: number };
  openRequests: number;
  openReports: number;
  /** Bisherige Generierungskosten im laufenden Monat (Summe der tatsächlichen Auftragskosten, nur Betreiberaufträge). */
  aiCostMonthUsd: number;
}

export async function getCatalogOverview(now: Date = new Date()): Promise<CatalogOverview> {
  const db = getDb();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [certs, categories, openRequests, [reports], [cost]] = await Promise.all([
    getCertificationsWithStats(),
    listCategories(),
    countOpenCourseRequests(),
    db.select({ n: sql<number>`count(*)` }).from(contentReports).where(eq(contentReports.status, "open")),
    db
      .select({ sum: sql<string>`coalesce(sum(${courseGenerationJobs.actualCostUsd}), 0)` })
      .from(courseGenerationJobs)
      .where(and(isNull(courseGenerationJobs.organizationId), gte(courseGenerationJobs.createdAt, monthStart))),
  ]);
  return {
    certifications: certs,
    categories,
    totals: {
      certifications: certs.length,
      lessons: certs.reduce((n, c) => n + c.stats.lessons, 0),
      questions: certs.reduce((n, c) => n + c.stats.questions, 0),
    },
    openRequests,
    openReports: Number(reports.n),
    aiCostMonthUsd: Number(cost.sum),
  };
}
