import { NextResponse } from "next/server";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { generateOverviewDraft } from "@/lib/server/course-overview/service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** „Mit KI erzeugen“: liefert nur einen Entwurf, gespeichert wird erst mit „Speichern“. */
export async function POST(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId, audit }) => {
    try {
      const overview = await generateOverviewDraft(certId);
      await audit("course.overview_drafted", "certification", certId);
      return NextResponse.json({ overview });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Entwurf fehlgeschlagen." }, { status: 422 });
    }
  });
}
