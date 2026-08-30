import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, objectives, sections, lessons, questions } from "@/lib/server/db/schema";

export interface CertificationStats {
  id: string;
  slug: string;
  name: string;
  provider: string;
  examName: string;
  examVersion: string;
  stats: {
    domains: number;
    objectives: number;
    sections: number;
    lessons: number;
    questions: number;
  };
  createdAt: Date;
}

/**
 * Shared by the admin API route and the admin dashboard server component.
 * Extracted so the server component can call this directly instead of doing
 * a self-fetch of its own API (which silently returned [] because it never
 * forwarded the session cookie - see roadmap2.md incident notes).
 */
export async function getCertificationsWithStats(): Promise<CertificationStats[]> {
  const db = getDb();

  const allCerts = await db.select().from(certifications).orderBy(certifications.createdAt);

  const statsPromises = allCerts.map(async (cert) => {
    const certDomains = await db.select().from(domains).where(eq(domains.certificationId, cert.id));

    const domainIds = certDomains.map((d) => d.id);
    const certObjectives =
      domainIds.length > 0
        ? await db.select().from(objectives).where(inArray(objectives.domainId, domainIds))
        : [];

    const objectiveIds = certObjectives.map((o) => o.id);
    const certSections =
      objectiveIds.length > 0
        ? await db.select().from(sections).where(inArray(sections.objectiveId, objectiveIds))
        : [];

    const sectionIds = certSections.map((s) => s.id);
    const certLessons =
      sectionIds.length > 0
        ? await db.select().from(lessons).where(inArray(lessons.sectionId, sectionIds))
        : [];

    const certQuestions =
      objectiveIds.length > 0
        ? await db.select().from(questions).where(inArray(questions.objectiveId, objectiveIds))
        : [];

    return {
      id: cert.id,
      slug: cert.slug,
      name: cert.name,
      provider: cert.provider,
      examName: cert.examName,
      examVersion: cert.examVersion,
      stats: {
        domains: certDomains.length,
        objectives: certObjectives.length,
        sections: certSections.length,
        lessons: certLessons.length,
        questions: certQuestions.length,
      },
      createdAt: cert.createdAt,
    };
  });

  return Promise.all(statsPromises);
}
