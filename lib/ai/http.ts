import OpenAI from "openai";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OpenAIConfigError } from "@/lib/openai";
import { AIGenerationError } from "./generate";

/** Wandelt Fehler aus Request-Validierung und KI-Generierung in aussagekräftige HTTP-Antworten um. */
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

  if (error instanceof OpenAIConfigError || error instanceof OpenAI.AuthenticationError) {
    return NextResponse.json(
      { error: "Server ist nicht korrekt konfiguriert (OPENAI_API_KEY)." },
      { status: 500 },
    );
  }

  if (error instanceof OpenAI.RateLimitError) {
    return NextResponse.json(
      { error: "Rate-Limit der KI-API erreicht. Bitte später erneut versuchen." },
      { status: 429 },
    );
  }

  if (error instanceof OpenAI.APIConnectionError) {
    return NextResponse.json(
      { error: "KI-API war nicht erreichbar." },
      { status: 502 },
    );
  }

  if (error instanceof OpenAI.APIError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ error: "Unerwarteter Serverfehler." }, { status: 500 });
}
