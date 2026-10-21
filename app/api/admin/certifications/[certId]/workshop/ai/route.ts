import { NextResponse } from "next/server";
import { AiAccessUnavailableError } from "@/lib/server/internal-courses/ai-client";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { AiEditError, aiRequestSchema, proposeAi } from "@/lib/server/course-editor/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** KI-Vorschlag für eine Lektion, eine Frage, neue Fragen oder ein fehlendes Lernziel. Speichert keinen Inhalt. */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId, audit }) => {
    const body = aiRequestSchema.parse(await request.json());
    try {
      const proposal = await proposeAi(certId, body);
      await audit("course.ai_proposal", body.target, "id" in body ? body.id : body.domainId, { action: body.action, costUsd: proposal.costUsd });
      return NextResponse.json({ proposal });
    } catch (error) {
      if (error instanceof AiEditError || error instanceof AiAccessUnavailableError) return NextResponse.json({ error: error.message }, { status: 422 });
      console.error("KI-Vorschlag fehlgeschlagen:", error);
      return NextResponse.json({ error: `Die KI hat keinen brauchbaren Vorschlag geliefert: ${error instanceof Error ? error.message.slice(0, 300) : "unbekannter Fehler"}` }, { status: 502 });
    }
  });
}
