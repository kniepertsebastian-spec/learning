import { GoogleGenAI } from "@google/genai";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export class GeminiConfigError extends Error {}

let client: GoogleGenAI | null = null;

/** Gemini-Client-Singleton. Liest den API-Key aus `GEMINI_API_KEY`. */
export function getGeminiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new GeminiConfigError(
      "GEMINI_API_KEY ist nicht gesetzt (siehe .env.example / .env.local).",
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}
