import { config } from "dotenv";
// .env (Basis, von docker-compose genutzt) zuerst laden, .env.local danach als
// optionaler lokaler Override - vorher wurde ausschließlich .env.local
// geladen, wodurch Setups mit nur .env (z.B. der Server) ohne Fehlermeldung
// keine Env-Vars bekamen.
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { eq, inArray, sql } from "drizzle-orm";
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
import {
  generateGroundedLessonsAndQuestionsForObjective,
  generateLessonsAndQuestionsForObjective,
} from "../lib/server/ai/service";
import { LESSONS_MODEL } from "../lib/claude";
import { getObjectiveSourceExcerpts } from "../lib/server/admin/objective-sources";
import { QualityCheckService } from "../lib/server/admin/quality-checks";
import { recordObjectiveGenerationCost } from "../lib/server/admin/objective-costs";
import type { AIUsage } from "../lib/ai/generate";
import type { Localized } from "../lib/types";
import type { LessonReviewStatus } from "../lib/server/db/schema";

/**
 * Erzeugt Lesson-Inhalt (Dev-Order Schritt 6) und einen Fragen-Pool
 * (Dev-Order Schritt 7) für jedes Objective, das noch keine hat - EIN Call pro
 * Objective (siehe generateLessonsAndQuestionsForObjective: ursprünglich zwei
 * Calls, zusammengelegt nachdem Geminis, dem ursprünglichen KI-Anbieter
 * (siehe roadmap2.md), Free-Tier live ein hartes Limit von 20 Requests/Tag
 * pro Modell zeigte - nach dem Wechsel zur Anthropic Claude API weiterhin so
 * kombiniert, da es die Anzahl nötiger Calls halbiert). Idempotent pro
 * Objective, läuft auf bereits von scripts/generate-curriculum-draft.ts
 * erzeugten Objectives/Sections. Bei einem Rate-Limit (429) bricht das
 * Skript einfach ab - erneutes Ausführen setzt dank Idempotenz beim nächsten
 * unfertigen Objective fort.
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

/**
 * Erkennt eine Postgres-23505-Verletzung (unique_violation) speziell auf
 * `questions_human_id_unique` - siehe isDuplicateHumanIdError()-Aufrufstelle
 * unten für den konkreten Fall, den das abfängt.
 */
function isDuplicateHumanIdError(error: unknown): boolean {
  const cause = error && typeof error === "object" ? Reflect.get(error, "cause") : undefined;
  if (!cause || typeof cause !== "object") return false;
  return (
    Reflect.get(cause, "code") === "23505" &&
    Reflect.get(cause, "constraint_name") === "questions_human_id_unique"
  );
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
      .select({ id: lessons.id, sectionId: lessons.sectionId, reviewStatus: lessons.reviewStatus })
      .from(lessons)
      .where(
        inArray(
          lessons.sectionId,
          objSections.map((s) => s.id),
        ),
      );
    const existingQuestions = await db
      .select({ id: questions.id, humanId: questions.humanId, stale: questions.stale })
      .from(questions)
      .where(eq(questions.objectiveId, objective.id));

    // R1.5: eine stale Lesson/Frage zählt NICHT als "bereits vorhanden" - sie
    // wird gezielt neu generiert statt übersprungen zu werden. Lessons sind
    // 1:1 an ihre Section gebunden (unique constraint) und werden daher bei
    // Regenerierung in-place aktualisiert; Fragen bleiben unangetastet
    // stehen (quiz_answers verweisen historisch auf sie) und werden durch
    // neue, zusätzliche ersetzt.
    const lessonBySectionId = new Map(existingLessons.map((lesson) => [lesson.sectionId, lesson]));
    const sectionsWithCurrentLesson = new Set(
      existingLessons.filter((lesson) => lesson.reviewStatus !== "stale").map((lesson) => lesson.sectionId),
    );
    const currentQuestionCount = existingQuestions.filter((question) => !question.stale).length;

    if (
      objSections.every((section) => sectionsWithCurrentLesson.has(section.id)) &&
      currentQuestionCount >= 5
    ) {
      console.log(`Objective ${objective.code} "${objective.title}": bereits vorhanden, überspringe.`);
      continue;
    }

    // R1.4: mit den beim Freigeben (blueprint-approval.ts) verknüpften
    // Quellenausschnitten generieren, falls vorhanden - sonst wie bisher frei
    // generieren (z. B. für Zertifizierungen ohne hochgeladene Quelle).
    const excerpts = await getObjectiveSourceExcerpts(objective.id);
    const grounded = excerpts.length > 0;
    const sourceVersionId = grounded ? excerpts[0].sourceId : null;
    const excerptByLocator = new Map(excerpts.map((e) => [e.locator, e]));

    console.log(
      `Objective ${objective.code} "${objective.title}": generiere Lessons + Fragen` +
        (grounded
          ? ` (quellengebunden, ${excerpts.length} Ausschnitte) ...`
          : " (frei, keine freigegebene Quelle) ..."),
    );

    interface NormalizedLesson {
      sectionOrderNum: number;
      content: Localized<string>;
      keyTakeaways: Localized<string[]>;
      examFocusPoints: Localized<string[]>;
      reviewStatus: LessonReviewStatus;
    }
    interface NormalizedQuestion {
      difficulty: string;
      type: string;
      question: Localized<string>;
      options: { text: Localized<string>; isCorrect: boolean }[];
      explanation: Localized<string>;
      sourceLocator: string | null;
      /** R1.4: "Aussagen ohne ausreichende Grundlage verwerfen" - eine Frage
       * ohne belegten sourceLocator wird nie gespeichert. */
      discard: boolean;
    }

    let normalizedLessons: NormalizedLesson[];
    let normalizedQuestions: NormalizedQuestion[];

    // R6 (roadmap.md): "Kosten je veröffentlichter Lesson/Frage" - sammelt
    // ALLE generateStructured()-Versuche für dieses Objective (inkl. interner
    // JSON-Korrekturversuche, die ebenfalls abgerechnet werden), siehe
    // recordObjectiveGenerationCost()-Aufruf unten.
    const objectiveUsages: AIUsage[] = [];
    const onUsage = (usage: AIUsage) => objectiveUsages.push(usage);

    if (grounded) {
      const { lessons: draftLessons, questions: draftQuestions } =
        await generateGroundedLessonsAndQuestionsForObjective(
          cert.name,
          objective.title,
          objective.description ?? objective.title,
          objSections.map((s) => ({
            orderNum: s.orderNum,
            titleEn: s.title.en,
            estimatedMinutes: s.estimatedMinutes ?? 20,
            difficulty: s.difficulty ?? "intermediate",
          })),
          excerpts.map((e) => ({ locator: e.locator, text: e.text })),
          onUsage,
        );
      normalizedLessons = draftLessons.map((draft) => ({
        sectionOrderNum: draft.sectionOrderNum,
        content: draft.content,
        keyTakeaways: draft.keyTakeaways,
        examFocusPoints: draft.examFocusPoints,
        // R1.4: "als Review-Fall markieren" statt eine ungegroundete Lesson
        // unmarkiert wie eine belegte zu behandeln.
        reviewStatus: draft.grounded ? "grounded" : "needs_review",
      }));
      normalizedQuestions = draftQuestions.map((draft) => ({
        difficulty: draft.difficulty,
        type: draft.type,
        question: draft.question,
        options: draft.options,
        explanation: draft.explanation,
        sourceLocator: draft.sourceLocator,
        discard: !draft.grounded || !draft.sourceLocator,
      }));
    } else {
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
          onUsage,
        );
      normalizedLessons = draftLessons.map((draft) => ({
        sectionOrderNum: draft.sectionOrderNum,
        content: draft.content,
        keyTakeaways: draft.keyTakeaways,
        examFocusPoints: draft.examFocusPoints,
        reviewStatus: "unreviewed",
      }));
      normalizedQuestions = draftQuestions.map((draft) => ({
        difficulty: draft.difficulty,
        type: draft.type,
        question: draft.question,
        options: draft.options,
        explanation: draft.explanation,
        sourceLocator: null,
        discard: false,
      }));
    }

    const sectionByOrder = new Map(objSections.map((s) => [s.orderNum, s]));
    let lessonsSaved = 0;
    for (const draft of normalizedLessons) {
      const section = sectionByOrder.get(draft.sectionOrderNum);
      if (!section) {
        console.warn(`  sectionOrderNum ${draft.sectionOrderNum} nicht gefunden, überspringe.`);
        continue;
      }
      if (sectionsWithCurrentLesson.has(section.id)) continue;

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

      const lessonValues = {
        content: draft.content,
        keyTakeaways: draft.keyTakeaways,
        examFocusPoints: draft.examFocusPoints,
        promptVersion: grounded ? "v2-grounded" : "v2",
        modelVersion: LESSONS_MODEL,
        sourceVersionId,
        reviewStatus: draft.reviewStatus,
      };
      const staleLesson = lessonBySectionId.get(section.id);
      if (staleLesson) {
        // R1.5: eine Section darf nur eine Lesson haben (unique constraint) -
        // eine stale Lesson wird daher in-place aktualisiert statt eine
        // zweite anzulegen.
        await db
          .update(lessons)
          .set({ ...lessonValues, version: sql`${lessons.version} + 1`, updatedAt: new Date() })
          .where(eq(lessons.id, staleLesson.id));
      } else {
        await db.insert(lessons).values({ sectionId: section.id, ...lessonValues });
      }
      sectionsWithCurrentLesson.add(section.id);
      lessonsSaved++;
    }

    let questionsSaved = 0;
    let questionsDiscarded = 0;
    const usedHumanIds = new Set(existingQuestions.map((question) => question.humanId));
    let nextQuestionNumber = 1;
    for (let i = 0; i < normalizedQuestions.length; i++) {
      if (currentQuestionCount + questionsSaved >= 5) break;
      const draft = normalizedQuestions[i];

      if (draft.discard) {
        questionsDiscarded++;
        continue;
      }

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

      const matchedExcerpt = draft.sourceLocator ? excerptByLocator.get(draft.sourceLocator) : undefined;

      // Race-sicher statt nur "vorher prüfen, dann einfügen": usedHumanIds ist
      // eine Momentaufnahme vom Start des Laufs - ein zweiter, paralleler Lauf
      // (z.B. ein Retry über die Admin-UI während ein älterer CLI-Aufruf noch
      // läuft) kann dieselbe ID in der Zwischenzeit belegen, ohne dass diese
      // Momentaufnahme das sieht. Bei einer 23505-Verletzung genau auf
      // questions_human_id_unique daher einfach die nächste ID versuchen,
      // statt das ganze Objective/Skript abzubrechen (live beobachtet).
      let question: typeof questions.$inferSelect | undefined;
      for (let attempt = 0; !question && attempt < 20; attempt++) {
        let humanId: string;
        do {
          humanId = `${humanIdPrefix(cert.slug)}-${objective.code}-Q${String(nextQuestionNumber).padStart(3, "0")}`;
          nextQuestionNumber++;
        } while (usedHumanIds.has(humanId));
        usedHumanIds.add(humanId);
        try {
          [question] = await db
            .insert(questions)
            .values({
              humanId,
              objectiveId: objective.id,
              difficulty: draft.difficulty,
              type: draft.type,
              question: draft.question,
              explanation: draft.explanation,
              sourceReference: matchedExcerpt?.locator ?? null,
              sourceChunkId: matchedExcerpt?.chunkId ?? null,
            })
            .returning();
        } catch (error) {
          if (!isDuplicateHumanIdError(error)) throw error;
        }
      }
      if (!question) {
        throw new Error(
          `Konnte für Objective ${objective.code} auch nach 20 Versuchen keine eindeutige humanId finden.`,
        );
      }

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

    if (objectiveUsages.length > 0) {
      await recordObjectiveGenerationCost(objective.id, {
        model: objectiveUsages.at(-1)?.model ?? LESSONS_MODEL,
        promptTokens: objectiveUsages.reduce((sum, u) => sum + u.promptTokens, 0),
        completionTokens: objectiveUsages.reduce((sum, u) => sum + u.completionTokens, 0),
        acceptedLessonCount: lessonsSaved,
        acceptedQuestionCount: questionsSaved,
      });
    }

    done++;
    console.log(
      `Objective ${objective.code}: ${lessonsSaved}/${normalizedLessons.length} Lessons, ` +
        `${questionsSaved}/${normalizedQuestions.length} Fragen gespeichert` +
        (questionsDiscarded > 0
          ? ` (${questionsDiscarded} ohne Quellengrundlage verworfen, Rest durch Qualitätsprüfung).`
          : " (Rest durch Qualitätsprüfung verworfen)."),
    );
  }

  console.log(`Fertig. ${done} Objective(s) in diesem Lauf verarbeitet (Rest ggf. schon vorhanden).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Lesson/Question-Generierung fehlgeschlagen:", err);
  process.exit(1);
});
