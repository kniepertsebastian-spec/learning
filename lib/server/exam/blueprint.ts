import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains } from "@/lib/server/db/schema";

export interface ExamBlueprint {
  totalQuestions: number;
  domainBreakdown: Array<{
    domainId: string;
    domainName: string;
    targetQuestions: number;
    weightPercent: number;
  }>;
}

/**
 * Creates an exam blueprint based on official exam weights.
 * Uses domain.weightPercent to distribute questions proportionally.
 */
export async function buildExamBlueprint(
  certificationId: string,
  totalQuestions: number = 90,
): Promise<ExamBlueprint> {
  const db = getDb();

  const allDomains = await db
    .select()
    .from(domains)
    .where(eq(domains.certificationId, certificationId))
    .orderBy(domains.orderNum);

  if (!allDomains.length) {
    throw new Error("No domains found for certification");
  }

  // Calculate total weight
  const totalWeight = allDomains.reduce((sum, d) => {
    const weight = d.weightPercent ? Number(d.weightPercent) : 0;
    return sum + weight;
  }, 0);

  if (totalWeight === 0) {
    // Fallback: equal distribution if no weights set
    const questionsPerDomain = Math.floor(totalQuestions / allDomains.length);
    return {
      totalQuestions,
      domainBreakdown: allDomains.map((domain) => ({
        domainId: domain.id,
        domainName: domain.name,
        targetQuestions: questionsPerDomain,
        weightPercent: domain.weightPercent ? Number(domain.weightPercent) : 0,
      })),
    };
  }

  // Distribute based on weight percentages
  const breakdown = allDomains.map((domain) => {
    const weight = domain.weightPercent ? Number(domain.weightPercent) : 0;
    const targetQuestions = Math.round((weight / totalWeight) * totalQuestions);
    return {
      domainId: domain.id,
      domainName: domain.name,
      targetQuestions: Math.max(1, targetQuestions), // At least 1 question per domain
      weightPercent: weight,
    };
  });

  // Adjust for rounding errors: redistribute the difference
  const actualTotal = breakdown.reduce((sum, d) => sum + d.targetQuestions, 0);
  const diff = totalQuestions - actualTotal;

  if (diff !== 0) {
    // Add/remove from largest domain
    const largest = breakdown.reduce((max, curr) =>
      curr.targetQuestions > max.targetQuestions ? curr : max,
    );
    largest.targetQuestions += diff;
  }

  return {
    totalQuestions,
    domainBreakdown: breakdown,
  };
}
