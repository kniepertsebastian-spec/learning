import { NextRequest, NextResponse } from "next/server";
import { generateStructured } from "@/lib/ai/generate";
import { toErrorResponse } from "@/lib/ai/http";
import { mockExamRequestSchema, mockExamResponseSchema } from "@/lib/ai/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = mockExamRequestSchema.parse(await request.json());

    const focusHint = body.focusAreas?.length
      ? `Lege einen Schwerpunkt auf folgende Themenbereiche: ${body.focusAreas.join(", ")}.\n`
      : "";

    const systemPrompt =
      "Du bist Prüfungsersteller für IT-Zertifizierungsprüfungen. Erstelle prüfungsnahe, " +
      "szenariobasierte Multiple-Choice-Fragen (jeweils 4 Antwortoptionen, genau eine korrekt) mit Erklärung, " +
      "im Stil und Schwierigkeitsgrad einer echten Zertifizierungsprüfung. " +
      "Jede Frage, jede Antwortoption und jede Erklärung müssen vollständig und gleichwertig sowohl auf " +
      "Deutsch (de) als auch auf Englisch (en) geliefert werden - beide Sprachversionen werden Endnutzern angezeigt.";

    const userPrompt =
      `Zertifikat: "${body.certName}"\n` +
      `Anzahl Fragen: ${body.questionCount}\n` +
      focusHint +
      `Gib ein JSON-Objekt der Form {"questions": [{"question": {"de": string, "en": string}, ` +
      `"options": {"de": string[4], "en": string[4]}, "correctIndex": number, ` +
      `"explanation": {"de": string, "en": string}}]} mit genau ${body.questionCount} Fragen zurück.`;

    const exam = await generateStructured(systemPrompt, userPrompt, mockExamResponseSchema);

    return NextResponse.json(exam);
  } catch (error) {
    return toErrorResponse(error);
  }
}
