import OpenAI from "openai";

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

export class OpenAIConfigError extends Error {}

let client: OpenAI | null = null;

/** OpenAI-Client-Singleton. Liest den API-Key aus `OPENAI_API_KEY`. */
export function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new OpenAIConfigError(
      "OPENAI_API_KEY ist nicht gesetzt (siehe .env.example / .env.local).",
    );
  }
  if (!client) {
    client = new OpenAI();
  }
  return client;
}
