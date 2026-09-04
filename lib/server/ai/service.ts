import { generateStructured } from "@/lib/ai/generate";
import {
  blueprintExtractionSchema,
  curriculumDraftForDomainResponseSchema,
  groundedLessonsAndQuestionsResponseSchema,
  lessonsAndQuestionsForObjectiveResponseSchema,
  remediationResponseSchema,
  type draftObjectiveSchema,
  type draftLessonSchema,
  type draftQuestionSchema,
  type groundedDraftLessonSchema,
  type groundedDraftQuestionSchema,
} from "./schemas";
import type { z } from "zod";

export type DraftObjective = z.infer<typeof draftObjectiveSchema>;
export type DraftLesson = z.infer<typeof draftLessonSchema>;
export type DraftQuestion = z.infer<typeof draftQuestionSchema>;
export type GroundedDraftLesson = z.infer<typeof groundedDraftLessonSchema>;
export type GroundedDraftQuestion = z.infer<typeof groundedDraftQuestionSchema>;
export type RemediationResponse = z.infer<typeof remediationResponseSchema>;
export type BlueprintExtraction = z.infer<typeof blueprintExtractionSchema>;
export interface LessonsAndQuestions {
  lessons: DraftLesson[];
  questions: DraftQuestion[];
}

/**
 * AIService (roadmap2.md Phase 15) - nur die Methoden, die tatsächlich
 * gebraucht werden (Dev-Order Schritt 3-7 bislang). Weitere Methoden
 * (generateQuiz, evaluateQuiz, generateRemediation, ...) kommen erst mit
 * ihren jeweiligen Dev-Order-Schritten dazu (9, 11-13) - kein Grund, jetzt
 * schon leere Platzhalter dafür anzulegen.
 */
export async function generateCurriculumDraftForDomain(
  certificationName: string,
  examVersion: string,
  domainOrderNum: number,
  domainName: string,
): Promise<DraftObjective[]> {
  const systemPrompt = [
    `Du bist ein Curriculum-Designer für die Zertifizierung "${certificationName}" (${examVersion}).`,
    `Erstelle für die EINE Domain "${domainName}" (Domain-Nummer ${domainOrderNum}) einen realistischen Entwurf`,
    "von Lern-Objectives mit je 1-6 Lernabschnitten (Sections).",
    "",
    "WICHTIG: Dies ist ein Näherungs-Entwurf, KEIN Zitat der offiziellen Exam-Objectives.",
    "Objective-Codes im Format `<Domain-Nummer>.<Laufnummer>` (z. B. \"" +
      domainOrderNum +
      '.1", "' +
      domainOrderNum +
      '.2").',
    "Objective-Titel und -Beschreibung auf Englisch (Fachbegriffe wie im echten Exam üblich).",
    "Section-Titel bilingual (Deutsch + Englisch).",
    "Schwierigkeitsgrad realistisch verteilen (nicht alles \"advanced\").",
    "Jede Section MUSS exakt diese Felder besitzen:",
    '{ "title": { "de": "Deutscher Titel", "en": "English title" }, "estimatedMinutes": 30, "difficulty": "beginner" }',
    "Für difficulty ist ausschließlich beginner, intermediate oder advanced erlaubt.",
  ].join("\n");

  const userPrompt = `Generiere den Objectives+Sections-Entwurf für Domain ${domainOrderNum} ("${domainName}").`;

  const result = await generateStructured(
    systemPrompt,
    userPrompt,
    curriculumDraftForDomainResponseSchema,
  );
  return result.objectives;
}

/**
 * Generiert Lerninhalt (alle Sections) UND den Fragen-Pool EINES Objectives in
 * einem einzigen Call (Dev-Order Schritt 6+7 kombiniert). Ursprünglich zwei
 * getrennte Calls - zusammengelegt, nachdem Geminis Free-Tier live ein hartes
 * Limit von 20 Requests/Tag pro Modell zeigte (429 RESOURCE_EXHAUSTED,
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier`). Halbiert die nötigen
 * Calls für alle 23 Objectives von 46 auf 23.
 */
export async function generateLessonsAndQuestionsForObjective(
  certificationName: string,
  objectiveTitle: string,
  objectiveDescription: string,
  sections: { orderNum: number; titleEn: string; estimatedMinutes: number; difficulty: string }[],
): Promise<LessonsAndQuestions> {
  const systemPrompt = [
    `Du bist Dozent und Prüfungsfragen-Autor für die Zertifizierung "${certificationName}",`,
    `Objective "${objectiveTitle}" - ${objectiveDescription}.`,
    "",
    "TEIL 1 - Lerninhalt: Erstelle didaktischen Markdown-Lerninhalt für JEDE der folgenden Sections:",
    ...sections.map(
      (s) =>
        `- sectionOrderNum ${s.orderNum}: "${s.titleEn}" (~${s.estimatedMinutes} Min, ${s.difficulty})`,
    ),
    "Jede Lesson enthält: Einführung, Kernkonzepte, Beispiele, häufige Fehler, prüfungsrelevante Punkte.",
    "Länge von `content` passend zur angegebenen Dauer.",
    "",
    "TEIL 2 - Fragen: Erstelle 6-8 Multiple-Choice-Fragen zu diesem Objective, Mischung aus",
    "knowledge, comprehension, application, scenario, troubleshooting.",
    "NICHT nur Faktenabfrage - bevorzugt szenariobasierte Fragen, die Verständnis testen",
    '(z. B. statt "Wofür steht CIA?" eher eine Situationsbeschreibung, die CIA anwendet).',
    "Genau 4 Antwortoptionen pro Frage, genau EINE davon korrekt. Schwierigkeitsgrade realistisch mischen.",
    "Das Feld `difficulty` MUSS bei jeder Frage exakt `beginner`, `intermediate` oder `advanced` sein.",
    "",
    "WICHTIG - jedes bilinguale Feld ist ein OBJEKT mit genau den Keys `de` und `en`,",
    "NIEMALS ein einzelner String oder ein Array direkt. Exaktes Ausgabeformat:",
    "```json",
    "{",
    '  "lessons": [',
    "    {",
    '      "sectionOrderNum": 1,',
    '      "content": { "de": "... Markdown auf Deutsch ...", "en": "... Markdown in English ..." },',
    '      "keyTakeaways": { "de": ["Punkt 1", "Punkt 2"], "en": ["Point 1", "Point 2"] },',
    '      "examFocusPoints": { "de": ["Punkt 1", "Punkt 2"], "en": ["Point 1", "Point 2"] }',
    "    }",
    "  ],",
    '  "questions": [',
    "    {",
    '      "difficulty": "intermediate",',
    '      "type": "scenario",',
    '      "question": { "de": "... Frage auf Deutsch ...", "en": "... Question in English ..." },',
    '      "options": [',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": false },',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": true },',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": false },',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": false }',
    "      ],",
    '      "explanation": { "de": "...", "en": "..." }',
    "    }",
    "  ]",
    "}",
    "```",
  ].join("\n");

  const userPrompt = `Generiere Lerninhalt + Fragen-Pool für Objective "${objectiveTitle}".`;

  return generateStructured(systemPrompt, userPrompt, lessonsAndQuestionsForObjectiveResponseSchema);
}

/**
 * Generiert Remediations-Inhalt für ein Objective, das der Lernende
 * nicht gut verstanden hat (< 60% bei Quiz; Dev-Order Schritt 11).
 * Kürzere, fokussierte Erklärung mit anderem Blickwinkel, häufigen
 * Missverständnissen + 3-5 einfachere Übungsfragen zum Neu-Testen.
 */
export async function generateRemediationForObjective(
  certificationName: string,
  objectiveTitle: string,
  objectiveDescription: string,
): Promise<RemediationResponse> {
  const systemPrompt = [
    `Du bist ein Lern-Therapeut für die Zertifizierung "${certificationName}".`,
    `Der Lernende hat Objective "${objectiveTitle}" nicht verstanden.`,
    "",
    "Erstelle eine KURZE Remediations-Lektion (2-3 Absätze, anders erklärt als die",
    "Haupt-Lektion), fokussiert auf das Kern-Konzept und häufige Missverständnisse.",
    "",
    "Dann: 3-5 einfache Multiple-Choice-Fragen (beginner/intermediate, NICHT advanced),",
    "um zu testen, ob der Lernende es jetzt besser versteht.",
    "",
    "Exaktes Ausgabeformat:",
    "```json",
    "{",
    '  "lesson": {',
    '    "title": { "de": "...", "en": "..." },',
    '    "explanation": { "de": "... Markdown-Text ...", "en": "... Markdown text ..." },',
    '    "keyPoints": { "de": ["Punkt 1", "Punkt 2"], "en": ["Point 1", "Point 2"] },',
    '    "commonMisconceptions": { "de": ["Fehler 1", "Fehler 2"], "en": ["Misconception 1", "Misconception 2"] }',
    "  },",
    '  "questions": [',
    "    {",
    '      "difficulty": "beginner",',
    '      "type": "knowledge",',
    '      "question": { "de": "...", "en": "..." },',
    '      "options": [',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": false },',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": true },',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": false },',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": false }',
    "      ],",
    '      "explanation": { "de": "...", "en": "..." }',
    "    }",
    "  ]",
    "}",
    "```",
  ].join("\n");

  const userPrompt = `Generiere Remediations-Lektion und Übungsfragen für "${objectiveTitle}".`;

  return generateStructured(systemPrompt, userPrompt, remediationResponseSchema);
}

/**
 * R1.2 (roadmap.md): strukturierte Extraktion von Zertifizierungsmetadaten,
 * Domains, Gewichtungen und Objectives aus einer bereits hochgeladenen und
 * seitenweise extrahierten Quelle (R1.1) - anders als
 * generateCurriculumDraftForDomain oben KEIN freier KI-Entwurf: die KI muss
 * jedes Feld aus `sourceText` belegen (Locator + Confidence pro Objective),
 * siehe blueprintExtractionSchema.
 */
export async function generateBlueprintDraft(sourceText: string): Promise<BlueprintExtraction> {
  const systemPrompt = [
    "Du extrahierst die offizielle Prüfungsstruktur aus einem bereitgestellten Auszug",
    "einer offiziellen Zertifizierungs-Prüfungsbeschreibung (z. B. CompTIA Exam Objectives).",
    "",
    "WICHTIG: Nutze AUSSCHLIESSLICH den bereitgestellten Text als Quelle. Erfinde keine",
    "Domains, Objectives, Titel oder Prozentwerte, die nicht im Text stehen oder sich nicht",
    "eindeutig daraus ableiten lassen.",
    "",
    'Der Text ist seitenweise mit Markierungen der Form "== Seite N ==" versehen.',
    '`locator` MUSS sich auf eine dieser Seitenzahlen beziehen (z. B. "S. 4" oder "S. 4-5"),',
    "niemals erfunden oder geschätzt sein.",
    "",
    "Für jedes Objective vergib `confidence` zwischen 0 und 1:",
    "1.0 = Code/Titel wörtlich und eindeutig im Text gefunden.",
    "0.5 = im Text vorhanden, aber Formulierung/Zuordnung leicht unsicher.",
    "0.0-0.3 = geraten/aus dem Kontext abgeleitet, nicht wörtlich belegt.",
    "",
    "`weightPercent` ist die offizielle Domain-Gewichtung in Prozent, FALLS im Text",
    "angegeben - sonst exakt `null` (nicht raten oder gleichmäßig verteilen).",
  ].join("\n");

  const userPrompt = [
    "Extrahiere Zertifizierungsname, Anbieter, Exam-Code sowie alle Domains mit",
    "Gewichtung und allen Objectives (Code, Titel, Beschreibung, Locator, Confidence)",
    "aus folgendem seitenmarkiertem Quelltext:",
    "",
    sourceText,
  ].join("\n");

  return generateStructured(systemPrompt, userPrompt, blueprintExtractionSchema);
}

export interface GroundedLessonsAndQuestions {
  lessons: GroundedDraftLesson[];
  questions: GroundedDraftQuestion[];
}

export interface SourceExcerpt {
  /** z. B. "S. 4" - muss identisch in den generierten Fragen als
   * `sourceLocator` zitiert werden können. */
  locator: string;
  text: string;
}

/**
 * R1.4 (roadmap.md): quellengebundene Variante von
 * generateLessonsAndQuestionsForObjective() - bekommt die für dieses
 * Objective freigegebenen Quellenausschnitte (objective_source_refs, siehe
 * lib/server/admin/objective-sources.ts) und verlangt, dass Lessons/Fragen
 * sich primär darauf stützen und ihre Grundlage markieren
 * (groundedDraftLessonSchema/groundedDraftQuestionSchema), statt frei zu
 * generieren wie der ungegroundete Pfad.
 */
export async function generateGroundedLessonsAndQuestionsForObjective(
  certificationName: string,
  objectiveTitle: string,
  objectiveDescription: string,
  sections: { orderNum: number; titleEn: string; estimatedMinutes: number; difficulty: string }[],
  excerpts: SourceExcerpt[],
): Promise<GroundedLessonsAndQuestions> {
  const systemPrompt = [
    `Du bist Dozent und Prüfungsfragen-Autor für die Zertifizierung "${certificationName}",`,
    `Objective "${objectiveTitle}" - ${objectiveDescription}.`,
    "",
    "Dir liegen unten AUSZÜGE AUS DER OFFIZIELLEN QUELLE für genau dieses Objective vor.",
    "Stütze Lerninhalt und Fragen VORRANGIG auf diese Auszüge statt auf allgemeines Wissen.",
    "",
    "TEIL 1 - Lerninhalt: Erstelle didaktischen Markdown-Lerninhalt für JEDE der folgenden Sections:",
    ...sections.map(
      (s) =>
        `- sectionOrderNum ${s.orderNum}: "${s.titleEn}" (~${s.estimatedMinutes} Min, ${s.difficulty})`,
    ),
    "Jede Lesson enthält: Einführung, Kernkonzepte, Beispiele, häufige Fehler, prüfungsrelevante Punkte.",
    "Setze `grounded: true`, wenn der Inhalt durch die Auszüge belegt ist, sonst `grounded: false`",
    "(dann darfst du sparsam mit allgemeinem Wissen ergänzen, aber musst es markieren).",
    "",
    "TEIL 2 - Fragen: Erstelle 6-8 Multiple-Choice-Fragen zu diesem Objective, Mischung aus",
    "knowledge, comprehension, application, scenario, troubleshooting.",
    "NICHT nur Faktenabfrage - bevorzugt szenariobasierte Fragen, die Verständnis testen.",
    "Genau 4 Antwortoptionen pro Frage, genau EINE davon korrekt. Schwierigkeitsgrade realistisch mischen.",
    "Das Feld `difficulty` MUSS bei jeder Frage exakt `beginner`, `intermediate` oder `advanced` sein.",
    "Jede Frage MUSS `sourceLocator` setzen: den Locator (z. B. \"S. 4\") des Auszugs unten, der Frage",
    "und richtige Antwort belegt - exakt einer der unten angegebenen Locator-Werte, NICHT erfunden.",
    "Findet sich in keinem Auszug eine Grundlage, setze `sourceLocator: null` und `grounded: false`.",
    "Ist ein Auszug die Grundlage, setze `grounded: true` und den passenden `sourceLocator`.",
    "",
    "Quellenauszüge für dieses Objective:",
    ...excerpts.flatMap((excerpt) => [`--- ${excerpt.locator} ---`, excerpt.text]),
    "",
    "WICHTIG - jedes bilinguale Feld ist ein OBJEKT mit genau den Keys `de` und `en`,",
    "NIEMALS ein einzelner String oder ein Array direkt. Exaktes Ausgabeformat:",
    "```json",
    "{",
    '  "lessons": [',
    "    {",
    '      "sectionOrderNum": 1,',
    '      "content": { "de": "... Markdown auf Deutsch ...", "en": "... Markdown in English ..." },',
    '      "keyTakeaways": { "de": ["Punkt 1", "Punkt 2"], "en": ["Point 1", "Point 2"] },',
    '      "examFocusPoints": { "de": ["Punkt 1", "Punkt 2"], "en": ["Point 1", "Point 2"] },',
    '      "grounded": true',
    "    }",
    "  ],",
    '  "questions": [',
    "    {",
    '      "difficulty": "intermediate",',
    '      "type": "scenario",',
    '      "question": { "de": "... Frage auf Deutsch ...", "en": "... Question in English ..." },',
    '      "options": [',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": false },',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": true },',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": false },',
    '        { "text": { "de": "...", "en": "..." }, "isCorrect": false }',
    "      ],",
    '      "explanation": { "de": "...", "en": "..." },',
    '      "sourceLocator": "S. 4",',
    '      "grounded": true',
    "    }",
    "  ]",
    "}",
    "```",
  ].join("\n");

  const userPrompt = `Generiere quellengebundenen Lerninhalt + Fragen-Pool für Objective "${objectiveTitle}".`;

  return generateStructured(systemPrompt, userPrompt, groundedLessonsAndQuestionsResponseSchema);
}
