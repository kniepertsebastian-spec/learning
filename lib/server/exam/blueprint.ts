import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains } from "@/lib/server/db/schema";

/** Fällt nur, wenn eine Zertifizierung (noch) kein aus der offiziellen Quelle
 * extrahiertes Prüfungsformat hat (siehe certifications.examQuestionCount) -
 * vorher war das hier der einzige, für jede Zertifizierung gleiche Wert. */
const DEFAULT_TOTAL_QUESTIONS = 90;

export interface ExamBlueprint {
  totalQuestions: number;
  /** Reales Zeitlimit der offiziellen Prüfung in Minuten, falls bekannt
   * (certifications.examDurationMinutes) - sonst null, siehe ExamSession für
   * den Fallback. */
  durationMinutes: number | null;
  passingScore: number | null;
  scoreScale: string | null;
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
 *
 * `totalQuestions`: explizit übergeben, um z. B. eine kürzere Übungsprüfung
 * zu erzwingen - ansonsten certifications.examQuestionCount (aus der
 * offiziellen Quelle) oder, falls das noch nicht extrahiert wurde,
 * DEFAULT_TOTAL_QUESTIONS.
 */
export async function buildExamBlueprint(
  certificationId: string,
  totalQuestions?: number,
): Promise<ExamBlueprint> {
  const db = getDb();

  const [cert] = await db
    .select({
      examQuestionCount: certifications.examQuestionCount,
      examDurationMinutes: certifications.examDurationMinutes,
      passingScore: certifications.passingScore,
      scoreScale: certifications.scoreScale,
    })
    .from(certifications)
    .where(eq(certifications.id, certificationId))
    .limit(1);
  if (!cert) {
    throw new Error("Certification not found");
  }
  const effectiveTotalQuestions =
    totalQuestions ?? cert.examQuestionCount ?? DEFAULT_TOTAL_QUESTIONS;
  const durationMinutes = cert.examDurationMinutes ?? null;
  const passingScore = cert.passingScore ? Number(cert.passingScore) : null;
  const scoreScale = cert.scoreScale ?? null;

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
    // Fallback: equal distribution if no weights set. Math.floor can leave a
    // remainder when totalQuestions doesn't divide evenly by domain count
    // (e.g. 90/7 = 12.85 -> 12*7 = 84, 6 questions short) - redistribute it
    // one at a time onto the first N domains rather than silently shipping
    // fewer questions than requested.
    const baseQuestionsPerDomain = Math.floor(effectiveTotalQuestions / allDomains.length);
    const remainder = effectiveTotalQuestions - baseQuestionsPerDomain * allDomains.length;
    return {
      totalQuestions: effectiveTotalQuestions,
      durationMinutes,
      passingScore,
      scoreScale,
      domainBreakdown: allDomains.map((domain, index) => ({
        domainId: domain.id,
        domainName: domain.name,
        targetQuestions: baseQuestionsPerDomain + (index < remainder ? 1 : 0),
        weightPercent: domain.weightPercent ? Number(domain.weightPercent) : 0,
      })),
    };
  }

  // Distribute based on weight percentages
  const breakdown = allDomains.map((domain) => {
    const weight = domain.weightPercent ? Number(domain.weightPercent) : 0;
    const targetQuestions = Math.round((weight / totalWeight) * effectiveTotalQuestions);
    return {
      domainId: domain.id,
      domainName: domain.name,
      targetQuestions: Math.max(1, targetQuestions), // At least 1 question per domain
      weightPercent: weight,
    };
  });

  // Adjust for rounding errors: redistribute the difference
  const actualTotal = breakdown.reduce((sum, d) => sum + d.targetQuestions, 0);
  const diff = effectiveTotalQuestions - actualTotal;

  if (diff !== 0) {
    // Add/remove from largest domain
    const largest = breakdown.reduce((max, curr) =>
      curr.targetQuestions > max.targetQuestions ? curr : max,
    );
    largest.targetQuestions += diff;
  }

  return {
    totalQuestions: effectiveTotalQuestions,
    durationMinutes,
    passingScore,
    scoreScale,
    domainBreakdown: breakdown,
  };
}
