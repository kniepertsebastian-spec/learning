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
 * humanId-Präfix "SEC" ist aktuell hartkodiert (nur eine Zertifizierung
 * existiert bislang) - ein echtes Präfix-Schema pro Zertifizierung ist ein
 * Dev-Order-Schritt-20-Thema ("Add more certifications").
 */
async function main() {
  const db = getDb();

  const [cert] = await db
    .select()
    .from(certifications)
    .where(eq(certifications.slug, "security-plus-sy0-701"))
    .limit(1);
  if (!cert) {
    console.error('Zertifikat "security-plus-sy0-701" nicht gefunden. Erst `npm run db:seed` ausführen.');
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

    const [existingLesson] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(
        inArray(
          lessons.sectionId,
          objSections.map((s) => s.id),
        ),
      )
      .limit(1);
    const [existingQuestion] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.objectiveId, objective.id))
      .limit(1);

    if (existingLesson && existingQuestion) {
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
    for (const draft of draftLessons) {
      const section = sectionByOrder.get(draft.sectionOrderNum);
      if (!section) {
        console.warn(`  sectionOrderNum ${draft.sectionOrderNum} nicht gefunden, überspringe.`);
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
    }

    for (let i = 0; i < draftQuestions.length; i++) {
      const draft = draftQuestions[i];
      const humanId = `SEC-${objective.code}-Q${String(i + 1).padStart(3, "0")}`;
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
    }

    done++;
    console.log(
      `Objective ${objective.code}: ${draftLessons.length} Lessons, ${draftQuestions.length} Fragen gespeichert.`,
    );
  }

  console.log(`Fertig. ${done} Objective(s) in diesem Lauf verarbeitet (Rest ggf. schon vorhanden).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Lesson/Question-Generierung fehlgeschlagen:", err);
  process.exit(1);
});
