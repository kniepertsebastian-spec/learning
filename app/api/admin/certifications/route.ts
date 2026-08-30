import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, objectives, sections, lessons, questions } from "@/lib/server/db/schema";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: Add admin role check when user roles are implemented
  // For now, allow all authenticated users (should be restricted to admins)

  const db = getDb();

  try {
    const allCerts = await db.select().from(certifications).orderBy(certifications.createdAt);

    // Get stats for each certification
    const statsPromises = allCerts.map(async (cert) => {
      const certDomains = await db
        .select()
        .from(domains)
        .where(eq(domains.certificationId, cert.id));

      const domainIds = certDomains.map((d) => d.id);
      const certObjectives =
        domainIds.length > 0
          ? await db
              .select()
              .from(objectives)
              .where(inArray(objectives.domainId, domainIds))
          : [];

      const objectiveIds = certObjectives.map((o) => o.id);
      const certSections =
        objectiveIds.length > 0
          ? await db
              .select()
              .from(sections)
              .where(inArray(sections.objectiveId, objectiveIds))
          : [];

      const sectionIds = certSections.map((s) => s.id);
      const certLessons =
        sectionIds.length > 0
          ? await db
              .select()
              .from(lessons)
              .where(inArray(lessons.sectionId, sectionIds))
          : [];

      const objectiveIdsForQuestions = certObjectives.map((o) => o.id);
      const certQuestions =
        objectiveIdsForQuestions.length > 0
          ? await db
              .select()
              .from(questions)
              .where(inArray(questions.objectiveId, objectiveIdsForQuestions))
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

    const results = await Promise.all(statsPromises);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error fetching certifications:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
