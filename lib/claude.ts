import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = "claude-opus-5";

export class ClaudeConfigError extends Error {}

let client: Anthropic | null = null;

/** Anthropic-Client-Singleton. Liest den API-Key aus `ANTHROPIC_API_KEY`. */
export function getClaudeClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ClaudeConfigError(
      "ANTHROPIC_API_KEY ist nicht gesetzt (siehe .env.example / .env.local).",
    );
  }
  if (!client) {
    client = new Anthropic();
  }
  return client;
}
