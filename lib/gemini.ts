import { GoogleGenAI } from "@google/genai";

/**
 * Standardmodell für alles (token_architektur_roadmap: Migration von gemini-3.8-flash). Modell-ID, 1M-Kontext, Denkstufen
 * low/medium/high/xhigh und „nur implizites Caching“ laut Google-Cloud-Modellseite zu Gemini 4 Hydrogen geprüft (19.11.2026).
 */
export const DEFAULT_GEMINI_MODEL = "gemini-4-hydrogen";

export const CURRICULUM_MODEL = process.env.GEMINI_CURRICULUM_MODEL || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
// "gemini-2.5-flash-lessons" war kein existierendes Modell (404 NOT_FOUND
// von der Gemini API in Produktion bestätigt) - Default jetzt auf dasselbe
// echte Modell wie CURRICULUM_MODEL, weiterhin per GEMINI_LESSONS_MODEL
// überschreibbar.
export const LESSONS_MODEL =
  process.env.GEMINI_LESSONS_MODEL || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

/**
 * Mechanische Folgeschritte nach der Kursgenerierung (Konzept-Tagging, Abfragevarianten, Voraussetzungen): kurze Eingaben, strenges
 * Schema, danach fachlich geprüft. Ohne eigene Angabe dasselbe Modell wie die Lektionen, es ändert sich also nichts.
 */
export const TAGGING_MODEL = process.env.GEMINI_TAGGING_MODEL || LESSONS_MODEL;

/**
 * Übersetzung fertiger Kurse in die zweite Sprache: reine Textarbeit ohne Quellen. Laut Roadmap dasselbe Modell wie die
 * Lektionen, aber mit Denkstufe `low` (siehe thinkingLevelFor("translation")): ein zweiter Anbieter ist nicht nötig.
 */
export const TRANSLATION_MODEL = process.env.GEMINI_TRANSLATION_MODEL || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

/**
 * Denkstufen (thinking_level) der Gemini-4-Modelle. Denk-Token werden als Ausgabe abgerechnet, deshalb je Schritt gezielt
 * (token_architektur_roadmap Abschnitt 3): Curriculum, Lektionen und Audit `high`, Übersetzung und mechanische Folgeschritte
 * (Konzept-Tagging, Voraussetzungen) `low`. `minimal` lehnt Gemini 4 Hydrogen mit HTTP 400 ab und ist deshalb nicht erlaubt.
 */
export const THINKING_LEVELS = ["low", "medium", "high", "xhigh"] as const;
export type ThinkingLevelName = (typeof THINKING_LEVELS)[number];
export type ThinkingStage = "curriculum" | "lessons" | "audit" | "translation" | "tagging";

const THINKING_DEFAULTS: Record<ThinkingStage, ThinkingLevelName> = {
  curriculum: "high",
  lessons: "high",
  audit: "high",
  translation: "low",
  tagging: "low",
};

/** Denkstufe eines Schritts: `GEMINI_THINKING_<SCHRITT>` (z. B. GEMINI_THINKING_CURRICULUM=xhigh), sonst die Vorgabe der Roadmap. */
export function thinkingLevelFor(stage: ThinkingStage): ThinkingLevelName {
  const raw = process.env[`GEMINI_THINKING_${stage.toUpperCase()}`]?.trim().toLowerCase();
  return (THINKING_LEVELS as readonly string[]).includes(raw ?? "") ? (raw as ThinkingLevelName) : THINKING_DEFAULTS[stage];
}

/**
 * Steuert das Modell das Denken über Stufen statt über ein Token-Budget? Gemini 4 lehnt `thinkingBudget` mit HTTP 400 ab;
 * ältere Modelle (2.5/3.x) bekommen weiter `thinkingBudget: 0` wie bisher.
 */
export function usesThinkingLevels(model: string): boolean {
  const major = /^gemini-(\d+)/.exec(model)?.[1];
  return major !== undefined && Number(major) >= 4;
}

export class GeminiConfigError extends Error {}

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
