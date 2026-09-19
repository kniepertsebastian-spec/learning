import { GoogleGenAI } from "@google/genai";

export const CURRICULUM_MODEL = process.env.GEMINI_CURRICULUM_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const LESSONS_MODEL = process.env.GEMINI_LESSONS_MODEL || "gemini-2.5-flash-lessons";

export class GeminiConfigError extends Error {}
export const ClaudeConfigError = GeminiConfigError;

let client: GoogleGenAI | null = null;

/** Gemini-Client-Singleton. Liest den API-Key aus `GEMINI_API_KEY`. */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigError(
      "GEMINI_API_KEY ist nicht gesetzt (siehe .env.example / .env.local).",
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export const getClaudeClient = getGeminiClient;
