import Anthropic from "@anthropic-ai/sdk";

/**
 * content:draft-curriculum (Domain-Entwurf, siehe generateCurriculumDraftForDomain)
 * und die Prüfungsstruktur-Extraktion aus offiziellen Quellen
 * (generateBlueprintDraft) - beide brauchen eher Design-/Extraktions-Urteil
 * als reine Textgenerierung, daher das teurere Modell.
 */
export const CURRICULUM_MODEL = process.env.CLAUDE_CURRICULUM_MODEL || "claude-sonnet-4-5";

/**
 * content:draft-lessons (Lektionen + Fragen pro Objective, viele Dutzend
 * Aufrufe pro Zertifizierung) und die synchrone, nutzerausgelöste
 * Remediation - hohes Aufrufvolumen, das günstigere Modell reicht.
 */
export const LESSONS_MODEL = process.env.CLAUDE_LESSONS_MODEL || "claude-haiku-4-5";

export class ClaudeConfigError extends Error {}

let client: Anthropic | null = null;

/** Claude-Client-Singleton. Liest den API-Key aus `ANTHROPIC_API_KEY`. */
export function getClaudeClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ClaudeConfigError(
      "ANTHROPIC_API_KEY ist nicht gesetzt (siehe .env.example / .env.local).",
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}
