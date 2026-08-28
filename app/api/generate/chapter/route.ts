import { NextRequest, NextResponse } from "next/server";
import { generateStructured } from "@/lib/ai/generate";
import { toErrorResponse } from "@/lib/ai/http";
import { chapterRequestSchema, chapterResponseSchema } from "@/lib/ai/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = chapterRequestSchema.parse(await request.json());

    const systemPrompt =
      "Du bist ein didaktischer Experte für IT-Zertifizierungsprüfungen. " +
      "Schreibe einen fundierten, gut strukturierten Lerntext in Markdown und erstelle dazu " +
      "5 szenariobasierte Multiple-Choice-Fragen (jeweils 4 Antwortoptionen, genau eine korrekt) mit Erklärung. " +
      "Sowohl der Lerntext als auch jede Frage, jede Antwortoption und jede Erklärung müssen vollständig und " +
      "gleichwertig sowohl auf Deutsch (de) als auch auf Englisch (en) geliefert werden - beide Sprachversionen " +
      "werden Endnutzern angezeigt.";

    const userPrompt =
      `Zertifikat: "${body.certName}"\n` +
      `Tag: ${body.day}\n` +
      `Modultitel (DE): "${body.moduleTitle.de}"\n` +
      `Modultitel (EN): "${body.moduleTitle.en}"\n\n` +
      `Gib ein JSON-Objekt der Form {"contentMarkdown": {"de": string, "en": string}, "questions": ` +
      `[{"question": {"de": string, "en": string}, "options": {"de": string[4], "en": string[4]}, ` +
      `"correctIndex": number, "explanation": {"de": string, "en": string}}]} mit genau 5 Fragen zurück.`;

    const chapter = await generateStructured(systemPrompt, userPrompt, chapterResponseSchema);

    return NextResponse.json(chapter);
  } catch (error) {
    return toErrorResponse(error);
  }
}
