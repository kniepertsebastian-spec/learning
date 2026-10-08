import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  domains,
  objectives,
  sections,
  lessons,
  questions,
  questionOptions,
} from "@/lib/server/db/schema";
import { scanForSecrets } from "@/lib/server/documents/secret-scanner";
import { type CoursePackageV1 } from "./schemas";

export class CoursePackageImportError extends Error {}

/**
 * Der Merkzettel wird aus Quellen gebaut, die der Secret-Scanner schon geprüft hat; die KI könnte aber trotzdem etwas
 * zusammensetzen, das wie ein Zugang aussieht. Findet der Scanner in einer Sprachfassung etwas, entfällt der ganze
 * Merkzettel dieser Lektion (die Lektion bleibt). Lieber kein Merkzettel als einer mit einem Passwort.
 */
export function safeCheatSheet(sheet: { de: string; en: string } | undefined): { de: string; en: string } | null {
  if (!sheet) return null;
  const pages = [
    { pageNumber: 1, text: sheet.de },
    { pageNumber: 2, text: sheet.en },
  ];
  return scanForSecrets(pages).length > 0 ? null : sheet;
}

/** Wie suggestSlug() in lib/server/admin/blueprint.ts, aber ohne dessen
 * Modul zu importieren (das zieht die gesamte R1-Blueprint-Admin-Logik mit
 * rein) - identische Regeln, damit erzeugte Slugs konsistent aussehen. */
export function suggestCourseSlug(title: string, certificationVersion?: string): string {
  return `${title} ${certificationVersion ?? ""}`
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Wie humanIdPrefix() in scripts/generate-lessons-and-questions.ts. Gilt für allgemeine Lernpfade (Slugs sind dort
 * eindeutig und sprechend). Interne Lernpfade der Firmen bekommen stattdessen ein Kürzel aus der eigenen ID, denn
 * ihre Titel und Lernziel-Codes („1.1“) wiederholen sich zwischen Firmen und Kursen, die Frage-ID ist aber eindeutig.
 */
function humanIdPrefix(slug: string): string {
  return slug.split("-")[0].substring(0, 3).toUpperCase();
}

export interface ImportedCourse {
  certificationId: string;
  slug: string;
  domainCount: number;
  objectiveCount: number;
  sectionCount: number;
  questionCount: number;
}

/**
 * Phase 1 (course_generation.md, Abschnitt 3.7 + 16): importiert ein
 * vollständiges, bereits validiertes `CoursePackageV1` in EINER
 * Datenbanktransaktion - entweder entsteht der komplette Kurs, oder gar
 * keiner ("Nutzer sehen niemals einen halbfertigen Kurs"). Reine
 * Struktur-Persistenz: Blueprint- und Content-Qualitätsprüfungen (Gates A-D,
 * Abschnitt 3.4) laufen VOR diesem Aufruf, nicht hier.
 *
 * `slugOverride` erlaubt es Aufrufern (z. B. dem Admin-Endpunkt), einen vom
 * Admin gewählten Slug statt des automatisch vorgeschlagenen zu verwenden -
 * genau wie bei R1s `suggestedSlug` in `blueprintDrafts`.
 */
export async function importCoursePackage(
  pkg: CoursePackageV1,
  slugOverride?: string,
  /** Interner Lernpfad einer Firma: gehört genau dieser Organisation und startet wie jeder KI-Entwurf als "draft". */
  owner?: { organizationId: string; includeSectionQuizzes?: boolean; includeFinalExam?: boolean },
): Promise<ImportedCourse> {
  const db = getDb();
  const slug = slugOverride ?? suggestCourseSlug(pkg.title, pkg.certificationVersion);
  const prefix = humanIdPrefix(slug);

  const existing = await db
    .select({ id: certifications.id })
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);
  if (existing.length > 0) {
    throw new CoursePackageImportError(
      `Zertifizierung mit Slug "${slug}" existiert bereits - Import abgebrochen.`,
    );
  }

  return db.transaction(async (tx) => {
    const [cert] = await tx
      .insert(certifications)
      .values({
        slug,
        name: pkg.title,
        provider: pkg.provider,
        examName: pkg.title,
        examVersion: pkg.certificationVersion ?? "v1",
        examQuestionCount: pkg.examQuestionCount,
        examDurationMinutes: pkg.examDurationMinutes,
        passingScore: pkg.passingScore === null ? null : pkg.passingScore.toString(),
        scoreScale: pkg.scoreScale,
        // KI-generierte Lernpfade brauchen die fachliche Freigabe (Name und Datum), bevor sie an Kunden gehen dürfen.
        catalogStatus: "draft",
        ...(owner
          ? {
              kind: "internal" as const,
              ownerOrganizationId: owner.organizationId,
              includeSectionQuizzes: owner.includeSectionQuizzes ?? true,
              includeFinalExam: owner.includeFinalExam ?? true,
            }
          : {}),
      })
      .returning();

    let sectionCount = 0;
    let questionCount = 0;
    let questionNumber = 1;

    for (const [domainIndex, domain] of pkg.domains.entries()) {
      const [domainRow] = await tx
        .insert(domains)
        .values({
          certificationId: cert.id,
          orderNum: domainIndex + 1,
          name: domain.title,
          // Blueprint-Gewicht ist ein Anteil (0-1, siehe courseBlueprintDomainSchema),
          // domains.weightPercent erwartet Prozent (0-100).
          weightPercent: (domain.weight * 100).toFixed(2),
        })
        .returning();

      for (const objective of domain.objectives) {
        const [objectiveRow] = await tx
          .insert(objectives)
          .values({
            domainId: domainRow.id,
            code: objective.code,
            title: objective.title,
            description: objective.description,
          })
          .returning();

        for (const [sectionIndex, section] of objective.sections.entries()) {
          const [sectionRow] = await tx
            .insert(sections)
            .values({
              objectiveId: objectiveRow.id,
              orderNum: sectionIndex + 1,
              title: section.title,
              estimatedMinutes: section.estimatedMinutes,
              difficulty: section.difficulty,
            })
            .returning();
          sectionCount++;

          await tx.insert(lessons).values({
            sectionId: sectionRow.id,
            content: section.content,
            keyTakeaways: section.keyTakeaways,
            examFocusPoints: section.examFocusPoints,
            cheatSheet: safeCheatSheet(section.cheatSheet),
            promptVersion: pkg.generation.promptVersion,
            modelVersion: pkg.generation.contentModel,
            reviewStatus: "unreviewed",
          });
        }

        for (const question of objective.questions) {
          const humanId = `${owner ? `I${cert.id.replace(/-/g, "").slice(0, 8).toUpperCase()}` : prefix}-${objective.code}-Q${String(questionNumber).padStart(3, "0")}`;
          questionNumber++;
          const [questionRow] = await tx
            .insert(questions)
            .values({
              humanId,
              objectiveId: objectiveRow.id,
              difficulty: question.difficulty,
              type: question.type,
              question: question.question,
              explanation: question.explanation,
              sourceReference: question.sourceLocator,
            })
            .returning();
          questionCount++;

          await tx.insert(questionOptions).values(
            question.options.map((option, index) => ({
              questionId: questionRow.id,
              orderNum: index + 1,
              text: option.text,
              isCorrect: option.isCorrect,
            })),
          );
        }
      }
    }

    return {
      certificationId: cert.id,
      slug,
      domainCount: pkg.domains.length,
      objectiveCount: pkg.domains.reduce((sum, d) => sum + d.objectives.length, 0),
      sectionCount,
      questionCount,
    };
  });
}
