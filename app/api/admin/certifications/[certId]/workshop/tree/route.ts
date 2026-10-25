import { NextResponse } from "next/server";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { getWorkshopTree } from "@/lib/server/course-editor/service";

export const dynamic = "force-dynamic";

/** Kurs-Werkstatt: Gliederung mit Hinweisen (Meldungen, Simulationen, Revisionen). */
export async function GET(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId }) => NextResponse.json({ tree: await getWorkshopTree(certId) }), { reviewers: true });
}
