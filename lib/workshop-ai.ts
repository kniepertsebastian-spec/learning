/**
 * KI-Nachbesserung in der Kurs-Werkstatt (roadmap3.md, Schritt 3): welche Aktionen es gibt und wie sie heißen. Geteilt
 * zwischen Server (Prompts, lib/server/course-editor/ai.ts) und Werkstatt-Oberfläche.
 */

export const SECTION_AI_ACTIONS = ["lively", "expand", "example", "simulation", "possible", "exam", "fix_reports", "custom"] as const;
export type SectionAiAction = (typeof SECTION_AI_ACTIONS)[number];

export const QUESTION_AI_ACTIONS = ["improve", "fix_reports", "custom"] as const;
export type QuestionAiAction = (typeof QUESTION_AI_ACTIONS)[number];

export type AiAction = SectionAiAction | QuestionAiAction | "add_questions" | "add_format_questions" | "add_objective";

export const AI_ACTION_LABELS: Record<AiAction, { de: string; en: string; hint: { de: string; en: string } }> = {
  lively: { de: "Lebendiger schreiben", en: "Make it livelier", hint: { de: "du-Form, erst das Problem, dann die Lösung, Beispiele aus dem Berufsalltag", en: "Direct address, problem first, everyday examples" } },
  expand: { de: "Ausführlicher erklären", en: "Explain in more depth", hint: { de: "für sehr kurze Lektionen: Hintergründe, Warum, Beispiele", en: "For very short lessons: background, why, examples" } },
  example: { de: "Praxisbeispiel ergänzen", en: "Add a hands-on example", hint: { de: "Block :::practice mit Szenario, Aufgabe, Lösung, Warum", en: "A :::practice block with scenario, task, solution, why" } },
  simulation: { de: "Simulation ergänzen", en: "Add a simulation", hint: { de: "interaktive Übung zum Selbstlösen, mit Textverweisen", en: "Interactive exercise with links back to the text" } },
  possible: { de: "„Was damit möglich ist“ ergänzen", en: "Add “What this makes possible”", hint: { de: "Hinweis [!POSSIBLE], ehrlich, ohne Versprechen", en: "A [!POSSIBLE] callout, honest, no promises" } },
  exam: { de: "Prüfungshinweis ergänzen", en: "Add an exam callout", hint: { de: "Hinweis [!EXAM]: was typischerweise abgefragt wird", en: "An [!EXAM] callout: what is typically asked" } },
  fix_reports: { de: "Gemeldeten Fehler beheben", en: "Fix reported problem", hint: { de: "prüft den Inhalt auf die Meldungen der Lernenden hin", en: "Checks the content against the learners' reports" } },
  custom: { de: "Eigene Anweisung", en: "Custom instruction", hint: { de: "frei formulieren, was die KI ändern soll", en: "Describe freely what the AI should change" } },
  improve: { de: "Frage verbessern", en: "Improve question", hint: { de: "klarer formulieren, plausible falsche Antworten, gute Erklärung", en: "Clearer wording, plausible distractors, good explanation" } },
  add_questions: { de: "Fragen ergänzen", en: "Add questions", hint: { de: "neue Fragen, die sich von den vorhandenen unterscheiden", en: "New questions that differ from the existing ones" } },
  add_format_questions: { de: "Formatfragen ergänzen", en: "Add format questions", hint: { de: "Reihenfolge, Kurzantwort, Zuordnung: Antwort selbst erzeugen statt wiedererkennen", en: "Ordering, short answer, matching: produce the answer instead of recognising it" } },
  add_objective: { de: "Fehlendes Lernziel ergänzen", en: "Add missing objective", hint: { de: "Lernziel mit Lektionen und Fragen anlegen", en: "Create the objective with lessons and questions" } },
};

export const isSectionAiAction = (a: string): a is SectionAiAction => (SECTION_AI_ACTIONS as readonly string[]).includes(a);
export const isQuestionAiAction = (a: string): a is QuestionAiAction => (QUESTION_AI_ACTIONS as readonly string[]).includes(a);
export const isAiAction = (a: string): a is AiAction => a in AI_ACTION_LABELS;

/** Kostenschätzung vor dem Aufruf: null = Preise fürs Modell nicht hinterlegt. */
export type AiEstimate = { action: AiAction; usd: number | null; inputTokens: number; outputTokens: number };

export const MAX_NEW_QUESTIONS = 10;
export const MAX_INSTRUCTION = 2000;
