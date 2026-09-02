import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import {
  certifications,
  domains,
  objectives,
  sections,
  lessons,
  questions,
  questionOptions,
} from "../lib/server/db/schema";
import { generateLessonsAndQuestionsForObjective } from "../lib/server/ai/service";
import { QualityCheckService } from "../lib/server/admin/quality-checks";

/**
 * Erzeugt Lesson-Inhalt (Dev-Order Schritt 6) und einen Fragen-Pool
 * (Dev-Order Schritt 7) für jedes Objective, das noch keine hat - EIN Call pro
 * Objective (siehe generateLessonsAndQuestionsForObjective: ursprünglich zwei
 * Calls, zusammengelegt nachdem Geminis Free-Tier live ein hartes Limit von
 * 20 Requests/Tag pro Modell zeigte). Idempotent pro Objective, läuft auf
 * bereits von scripts/generate-curriculum-draft.ts erzeugten
 * Objectives/Sections. Bei RESOURCE_EXHAUSTED (429, Tageslimit) bricht das
 * Skript einfach ab - erneutes Ausführen (auch an einem späteren Tag) setzt
 * dank Idempotenz beim nächsten unfertigen Objective fort.
 *
 * Zertifikat wird per CLI-Argument gewählt (Default: security-plus-sy0-701,
 * damit bestehende Aufrufe ohne Argument weiterlaufen). Der humanId-Präfix
 * wird aus dem ersten Wort des Slugs abgeleitet ("security-plus-sy0-701" ->
 * "SEC", "network-plus" -> "NET"), statt hartkodiert zu sein.
 *
 * Usage: npm run content:draft-lessons -- <cert-slug>
 */
function humanIdPrefix(slug: string): string {
  return slug.split("-")[0].substring(0, 3).toUpperCase();
}

async function main() {
  const db = getDb();
  const certSlug = process.argv[2] || "security-plus-sy0-701";

  const [cert] = await db
    .select()
    .from(certifications)
    .where(eq(certifications.slug, certSlug))
    .limit(1);
  if (!cert) {
    console.error(`Zertifikat "${certSlug}" nicht gefunden. Erst \`npm run db:seed\` oder \`npm run cert:add\` ausführen.`);
    process.exit(1);
  }

  const certDomains = await db
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.certificationId, cert.id));

  if (certDomains.length === 0) {
    console.error("Keine Domains gefunden. Erst `npm run db:seed` ausführen.");
    process.exit(1);
  }

  const certObjectives = await db
    .select()
    .from(objectives)
    .where(
      inArray(
        objectives.domainId,
        certDomains.map((d) => d.id),
      ),
    )
    .orderBy(objectives.code);

  if (certObjectives.length === 0) {
    console.error("Keine Objectives gefunden. Erst `npm run content:draft-curriculum` ausführen.");
    process.exit(1);
  }

  let done = 0;
  for (const objective of certObjectives) {
    const objSections = await db
      .select()
      .from(sections)
      .where(eq(sections.objectiveId, objective.id))
      .orderBy(sections.orderNum);

    const existingLessons = await db
      .select({ id: lessons.id, sectionId: lessons.sectionId })
      .from(lessons)
      .where(
        inArray(
          lessons.sectionId,
          objSections.map((s) => s.id),
        ),
      );
    const existingQuestions = await db
      .select({ id: questions.id, humanId: questions.humanId })
      .from(questions)
      .where(eq(questions.objectiveId, objective.id));

    const sectionsWithLesson = new Set(existingLessons.map((lesson) => lesson.sectionId));
    if (
      objSections.every((section) => sectionsWithLesson.has(section.id)) &&
      existingQuestions.length >= 5
    ) {
      console.log(`Objective ${objective.code} "${objective.title}": bereits vorhanden, überspringe.`);
      continue;
    }

    console.log(`Objective ${objective.code} "${objective.title}": generiere Lessons + Fragen ...`);
    const { lessons: draftLessons, questions: draftQuestions } =
      await generateLessonsAndQuestionsForObjective(
        cert.name,
        objective.title,
        objective.description ?? objective.title,
        objSections.map((s) => ({
          orderNum: s.orderNum,
          titleEn: s.title.en,
          estimatedMinutes: s.estimatedMinutes ?? 20,
          difficulty: s.difficulty ?? "intermediate",
        })),
      );

    const sectionByOrder = new Map(objSections.map((s) => [s.orderNum, s]));
    let lessonsSaved = 0;
    for (const draft of draftLessons) {
      const section = sectionByOrder.get(draft.sectionOrderNum);
      if (!section) {
        console.warn(`  sectionOrderNum ${draft.sectionOrderNum} nicht gefunden, überspringe.`);
        continue;
      }
      if (sectionsWithLesson.has(section.id)) continue;

      const quality = QualityCheckService.checkLessonQuality({
        content: draft.content.en,
        keyTakeaways: draft.keyTakeaways.en,
        examFocusPoints: draft.examFocusPoints.en,
      });
      if (!quality.passed) {
        console.warn(
          `  Section ${draft.sectionOrderNum}: Qualitätsprüfung fehlgeschlagen (${quality.score}/100), überspringe. Fehler: ${quality.checks
            .filter((c) => !c.passed && c.severity === "error")
            .map((c) => c.message)
            .join("; ")}`,
        );
        continue;
      }

      await db.insert(lessons).values({
        sectionId: section.id,
        content: draft.content,
        keyTakeaways: draft.keyTakeaways,
        examFocusPoints: draft.examFocusPoints,
        promptVersion: "v2",
        modelVersion: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      });
      sectionsWithLesson.add(section.id);
      lessonsSaved++;
    }

    let questionsSaved = 0;
    const usedHumanIds = new Set(existingQuestions.map((question) => question.humanId));
    let nextQuestionNumber = 1;
    for (let i = 0; i < draftQuestions.length; i++) {
      if (existingQuestions.length + questionsSaved >= 5) break;
      const draft = draftQuestions[i];

      const quality = QualityCheckService.checkQuestionQuality({
        question: draft.question.en,
        options: draft.options.map((o) => ({ text: o.text.en, isCorrect: o.isCorrect })),
        explanation: draft.explanation.en,
        difficulty: draft.difficulty,
      });
      if (!quality.passed) {
        console.warn(
          `  Frage ${i + 1}: Qualitätsprüfung fehlgeschlagen (${quality.score}/100), überspringe. Fehler: ${quality.checks
            .filter((c) => !c.passed && c.severity === "error")
            .map((c) => c.message)
            .join("; ")}`,
        );
        continue;
      }

      let humanId: string;
      do {
        humanId = `${humanIdPrefix(cert.slug)}-${objective.code}-Q${String(nextQuestionNumber).padStart(3, "0")}`;
        nextQuestionNumber++;
      } while (usedHumanIds.has(humanId));
      usedHumanIds.add(humanId);
      const [question] = await db
        .insert(questions)
        .values({
          humanId,
          objectiveId: objective.id,
          difficulty: draft.difficulty,
          type: draft.type,
          question: draft.question,
          explanation: draft.explanation,
        })
        .returning();

      await db.insert(questionOptions).values(
        draft.options.map((option, index) => ({
          questionId: question.id,
          orderNum: index + 1,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
      );
      questionsSaved++;
    }

    done++;
    console.log(
      `Objective ${objective.code}: ${lessonsSaved}/${draftLessons.length} Lessons, ${questionsSaved}/${draftQuestions.length} Fragen gespeichert (Rest durch Qualitätsprüfung verworfen).`,
    );
  }

  console.log(`Fertig. ${done} Objective(s) in diesem Lauf verarbeitet (Rest ggf. schon vorhanden).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Lesson/Question-Generierung fehlgeschlagen:", err);
  process.exit(1);
});
