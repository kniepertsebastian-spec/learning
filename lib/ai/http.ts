import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { GeminiConfigError } from "@/lib/claude";
import { AIGenerationError } from "./generate";

/**
 * Wandelt Fehler aus Request-Validierung und KI-Generierung in aussagekräftige
 * HTTP-Antworten um.
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

  const message = error instanceof Error ? error.message : String(error);
  if (/RESOURCE_EXHAUSTED|429|rate_limit/i.test(message)) {
    return NextResponse.json(
      { error: "Rate-Limit der KI-API erreicht. Bitte später erneut versuchen." },
      { status: 429 },
    );
  }

  return NextResponse.json({ error: "Unerwarteter Serverfehler." }, { status: 500 });
}
