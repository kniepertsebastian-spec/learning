import { ApiError } from "@google/genai";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { GeminiConfigError } from "@/lib/gemini";
import { AIGenerationError } from "./generate";

/**
 * Wandelt Fehler aus Request-Validierung und KI-Generierung in aussagekräftige
 * HTTP-Antworten um. Gemini's SDK (anders als die OpenAI-SDK) hat keine
 * getrennten Error-Klassen pro Fehlerart, nur die eine `ApiError` mit einem
 * HTTP-`status`-Feld - daher hier die Unterscheidung per Statuscode.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Ungültige Anfrage.", details: error.issues },
      { status: 400 },
    );
  }

  if (error instanceof AIGenerationError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  if (error instanceof GeminiConfigError) {
    return NextResponse.json(
      { error: "Server ist nicht korrekt konfiguriert (GEMINI_API_KEY)." },
      { status: 500 },
    );
  }

  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json(
        { error: "Server ist nicht korrekt konfiguriert (GEMINI_API_KEY)." },
        { status: 500 },
      );
    }
    if (error.status === 429) {
      return NextResponse.json(
        { error: "Rate-Limit der KI-API erreicht. Bitte später erneut versuchen." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ error: "Unerwarteter Serverfehler." }, { status: 500 });
}
