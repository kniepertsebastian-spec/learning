import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ClaudeConfigError } from "@/lib/claude";
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

  if (error instanceof ClaudeConfigError || error instanceof Anthropic.AuthenticationError) {
    return NextResponse.json(
      { error: "Server ist nicht korrekt konfiguriert (ANTHROPIC_API_KEY)." },
      { status: 500 },
    );
  }

  if (error instanceof Anthropic.RateLimitError) {
    return NextResponse.json(
      { error: "Rate-Limit der KI-API erreicht. Bitte später erneut versuchen." },
      { status: 429 },
    );
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return NextResponse.json(
      { error: "KI-API war nicht erreichbar." },
      { status: 502 },
    );
  }

  if (error instanceof Anthropic.APIError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ error: "Unerwarteter Serverfehler." }, { status: 500 });
}
