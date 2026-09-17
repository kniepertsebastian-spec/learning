import type { CoursePackageV1 } from "./schemas";
import { COURSE_PACKAGE_SCHEMA_VERSION } from "./schemas";

/**
 * Phase 1 (course_generation.md, Abschnitt 16): "bestehenden Beispielkurs als
 * Import-Fixture abbilden" - ein kleines, aber vollständiges `CoursePackageV1`
 * (1 Domain, 2 Objectives, je 1 Section + Mindestfragenzahl), genutzt sowohl
 * vom Schema-Unit-Test (generate.test.ts-Stil, reine Validierung) als auch
 * von einem echten Import gegen Postgres (siehe scripts/import-course-package-fixture.ts).
 */
export function buildSampleCoursePackage(slugSeed: string): CoursePackageV1 {
  return {
    schemaVersion: COURSE_PACKAGE_SCHEMA_VERSION,
    requestId: `fixture-${slugSeed}`,
    title: `Fixture Cert ${slugSeed}`,
    description: "Automatisch erzeugter Testkurs für den Phase-1-Importer-Test.",
    language: "de",
    provider: "Fixture Provider",
    certificationVersion: "v1",
    examQuestionCount: 60,
    examDurationMinutes: 90,
    passingScore: 700,
    scoreScale: "100-900",
    sources: [
      {
        id: "src-1",
        title: "Offizieller Exam Guide (Fixture)",
        url: "https://example.org/exam-guide.pdf",
        retrievedAt: "2026-09-17T00:00:00.000Z",
      },
    ],
    domains: [
      {
        id: "dom-1",
        title: "Fundamentals",
        weight: 1,
        objectives: [
          {
            id: "obj-1-1",
            code: "1.1",
            title: "Core Concepts",
            description: "Understand the core concepts covered by this fixture.",
            examWeight: 0.6,
            complexity: "low",
            requiredConcepts: ["concept-a", "concept-b"],
            commonMisconceptions: ["Mixing up concept A and B."],
            lessonPlan: ["Introduce concept A", "Introduce concept B"],
            sourceLocators: ["S. 4"],
            recommendedQuestions: 4,
            requiredScenarios: [],
            sections: [
              {
                title: { de: "Kernkonzepte", en: "Core Concepts" },
                estimatedMinutes: 20,
                difficulty: "beginner",
                content: {
                  de: "Dies ist der deutsche Lerninhalt für Kernkonzepte.",
                  en: "This is the English lesson content for core concepts.",
                },
                keyTakeaways: {
                  de: ["Konzept A verstehen", "Konzept B verstehen"],
                  en: ["Understand concept A", "Understand concept B"],
                },
                examFocusPoints: {
                  de: ["Konzept A wird oft geprüft", "Unterschied A/B kennen"],
                  en: ["Concept A is frequently tested", "Know the A/B distinction"],
                },
              },
            ],
            questions: [
              {
                difficulty: "beginner",
                type: "knowledge",
                question: { de: "Was ist Konzept A?", en: "What is concept A?" },
                options: [
                  { text: { de: "Richtige Antwort", en: "Correct answer" }, isCorrect: true },
                  { text: { de: "Falsche Antwort 1", en: "Wrong answer 1" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 2", en: "Wrong answer 2" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 3", en: "Wrong answer 3" }, isCorrect: false },
                ],
                explanation: {
                  de: "Konzept A ist per Definition die richtige Antwort.",
                  en: "Concept A is, by definition, the correct answer.",
                },
                sourceLocator: "S. 4",
              },
              {
                difficulty: "intermediate",
                type: "comprehension",
                question: { de: "Wie unterscheiden sich A und B?", en: "How do A and B differ?" },
                options: [
                  { text: { de: "Falsche Antwort 1", en: "Wrong answer 1" }, isCorrect: false },
                  { text: { de: "Richtige Antwort", en: "Correct answer" }, isCorrect: true },
                  { text: { de: "Falsche Antwort 2", en: "Wrong answer 2" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 3", en: "Wrong answer 3" }, isCorrect: false },
                ],
                explanation: {
                  de: "A und B unterscheiden sich im Anwendungsfall.",
                  en: "A and B differ in their use case.",
                },
                sourceLocator: "S. 4",
              },
              {
                difficulty: "intermediate",
                type: "application",
                question: { de: "Wann wendet man Konzept A an?", en: "When do you apply concept A?" },
                options: [
                  { text: { de: "Falsche Antwort 1", en: "Wrong answer 1" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 2", en: "Wrong answer 2" }, isCorrect: false },
                  { text: { de: "Richtige Antwort", en: "Correct answer" }, isCorrect: true },
                  { text: { de: "Falsche Antwort 3", en: "Wrong answer 3" }, isCorrect: false },
                ],
                explanation: {
                  de: "Konzept A passt in genau diesem Szenario.",
                  en: "Concept A fits exactly this scenario.",
                },
                sourceLocator: null,
              },
              {
                difficulty: "advanced",
                type: "scenario",
                question: { de: "Szenario: Was tun Sie zuerst?", en: "Scenario: what do you do first?" },
                options: [
                  { text: { de: "Falsche Antwort 1", en: "Wrong answer 1" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 2", en: "Wrong answer 2" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 3", en: "Wrong answer 3" }, isCorrect: false },
                  { text: { de: "Richtige Antwort", en: "Correct answer" }, isCorrect: true },
                ],
                explanation: {
                  de: "Der erste Schritt folgt aus Konzept B.",
                  en: "The first step follows from concept B.",
                },
                sourceLocator: "S. 4",
              },
            ],
          },
          {
            id: "obj-1-2",
            code: "1.2",
            title: "Applied Practice",
            description: "Apply the concepts from 1.1 to a realistic scenario.",
            examWeight: 0.4,
            complexity: "medium",
            requiredConcepts: ["concept-a"],
            commonMisconceptions: [],
            lessonPlan: ["Walk through a worked example"],
            sourceLocators: ["S. 6"],
            recommendedQuestions: 4,
            requiredScenarios: ["Cross-account access"],
            sections: [
              {
                title: { de: "Angewandte Praxis", en: "Applied Practice" },
                estimatedMinutes: 25,
                difficulty: "intermediate",
                content: {
                  de: "Dies ist der deutsche Lerninhalt für angewandte Praxis.",
                  en: "This is the English lesson content for applied practice.",
                },
                keyTakeaways: {
                  de: ["Anwendungsfall verstehen", "Fehler vermeiden"],
                  en: ["Understand the use case", "Avoid common mistakes"],
                },
                examFocusPoints: {
                  de: ["Praxisbeispiele werden häufig geprüft", "Cross-account access kennen"],
                  en: ["Worked examples are frequently tested", "Know cross-account access"],
                },
              },
            ],
            questions: [
              {
                difficulty: "intermediate",
                type: "application",
                question: { de: "Wie setzt man Konzept A praktisch um?", en: "How do you apply concept A in practice?" },
                options: [
                  { text: { de: "Richtige Antwort", en: "Correct answer" }, isCorrect: true },
                  { text: { de: "Falsche Antwort 1", en: "Wrong answer 1" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 2", en: "Wrong answer 2" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 3", en: "Wrong answer 3" }, isCorrect: false },
                ],
                explanation: {
                  de: "Die praktische Umsetzung folgt direkt aus Konzept A.",
                  en: "The practical application follows directly from concept A.",
                },
                sourceLocator: "S. 6",
              },
              {
                difficulty: "advanced",
                type: "troubleshooting",
                question: { de: "Was ist der häufigste Fehler?", en: "What is the most common mistake?" },
                options: [
                  { text: { de: "Falsche Antwort 1", en: "Wrong answer 1" }, isCorrect: false },
                  { text: { de: "Richtige Antwort", en: "Correct answer" }, isCorrect: true },
                  { text: { de: "Falsche Antwort 2", en: "Wrong answer 2" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 3", en: "Wrong answer 3" }, isCorrect: false },
                ],
                explanation: {
                  de: "Der häufigste Fehler ist die Verwechslung von A und B.",
                  en: "The most common mistake is confusing A and B.",
                },
                sourceLocator: null,
              },
              {
                difficulty: "beginner",
                type: "knowledge",
                question: { de: "Welches Szenario ist typisch?", en: "Which scenario is typical?" },
                options: [
                  { text: { de: "Falsche Antwort 1", en: "Wrong answer 1" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 2", en: "Wrong answer 2" }, isCorrect: false },
                  { text: { de: "Richtige Antwort", en: "Correct answer" }, isCorrect: true },
                  { text: { de: "Falsche Antwort 3", en: "Wrong answer 3" }, isCorrect: false },
                ],
                explanation: {
                  de: "Cross-account access ist das typische Szenario.",
                  en: "Cross-account access is the typical scenario.",
                },
                sourceLocator: "S. 6",
              },
              {
                difficulty: "intermediate",
                type: "comprehension",
                question: { de: "Warum ist Konzept A wichtig?", en: "Why does concept A matter here?" },
                options: [
                  { text: { de: "Falsche Antwort 1", en: "Wrong answer 1" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 2", en: "Wrong answer 2" }, isCorrect: false },
                  { text: { de: "Falsche Antwort 3", en: "Wrong answer 3" }, isCorrect: false },
                  { text: { de: "Richtige Antwort", en: "Correct answer" }, isCorrect: true },
                ],
                explanation: {
                  de: "Ohne Konzept A funktioniert die Praxis nicht.",
                  en: "Without concept A, the practice doesn't work.",
                },
                sourceLocator: "S. 6",
              },
            ],
          },
        ],
      },
    ],
    generation: {
      blueprintProvider: "claude-routine-sonnet",
      blueprintModel: "claude-sonnet-4-5",
      contentProvider: "anthropic-haiku",
      contentModel: "claude-haiku-4-5",
      promptVersion: "course-generation-v1",
      generatedAt: "2026-09-17T00:00:00.000Z",
    },
  };
}
