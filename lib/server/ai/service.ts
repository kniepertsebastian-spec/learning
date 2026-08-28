import { generateStructured } from "@/lib/ai/generate";
import {
  curriculumDraftForDomainResponseSchema,
  type draftObjectiveSchema,
} from "./schemas";
import type { z } from "zod";

export type DraftObjective = z.infer<typeof draftObjectiveSchema>;

/**
 * AIService (roadmap2.md Phase 15) - bislang nur die eine Methode, die
 * tatsächlich gebraucht wird (Dev-Order Schritt 3-5). Weitere Methoden
 * (generateLesson, generateQuiz, evaluateQuiz, generateRemediation, ...)
 * kommen erst mit ihren jeweiligen Dev-Order-Schritten dazu (6, 7, 9, 11-13) -
 * kein Grund, jetzt schon leere Platzhalter dafür anzulegen.
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
  ].join("\n");

  const userPrompt = `Generiere den Objectives+Sections-Entwurf für Domain ${domainOrderNum} ("${domainName}").`;

  const result = await generateStructured(
    systemPrompt,
    userPrompt,
    curriculumDraftForDomainResponseSchema,
  );
  return result.objectives;
}
