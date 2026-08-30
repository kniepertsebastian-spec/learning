import { NextRequest, NextResponse } from "next/server";
import { generateStructured } from "@/lib/ai/generate";
import { toErrorResponse } from "@/lib/ai/http";
import { curriculumRequestSchema, curriculumResponseSchema } from "@/lib/ai/schemas";
import { auth } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  try {
    // This calls a live, billed Gemini generation on every request with no
    // caching - previously reachable by anyone with no account at all.
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = curriculumRequestSchema.parse(await request.json());

    const systemPrompt =
      "Du bist ein didaktischer Experte für IT-Zertifizierungsprüfungen. " +
      "Erstelle einen Tag-für-Tag-Lehrplan, der eine Person optimal auf ein IT-Zertifikat vorbereitet. " +
      "Jeder Modultitel und jede Zusammenfassung muss vollständig und gleichwertig sowohl auf Deutsch (de) " +
      "als auch auf Englisch (en) geliefert werden - beide Sprachversionen werden Endnutzern angezeigt.";

    const userPrompt =
      `Zertifikat: "${body.certName}"\n` +
      `Anzahl Tage: ${body.totalDays}\n\n` +
      `Gib ein JSON-Objekt der Form {"modules": [{"day": number, "title": {"de": string, "en": string}, "summary": {"de": string, "en": string}}]} ` +
      `mit genau ${body.totalDays} Modulen (day 1 bis ${body.totalDays}) zurück. Jede Zusammenfassung soll 1-2 Sätze umfassen.`;

    const curriculum = await generateStructured(systemPrompt, userPrompt, curriculumResponseSchema);

    return NextResponse.json(curriculum);
  } catch (error) {
    return toErrorResponse(error);
  }
}
