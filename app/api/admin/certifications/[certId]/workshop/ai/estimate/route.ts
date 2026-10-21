import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { AI_EDIT_MODEL, estimateAi } from "@/lib/server/course-editor/ai";

export const dynamic = "force-dynamic";

const schema = z.object({
  target: z.enum(["section", "question", "objective", "missing-objective"]),
  id: z.string().uuid().optional(),
  count: z.number().int().min(1).max(20).optional(),
});

/** Kostenschätzung je KI-Aktion, ohne KI-Aufruf. */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId }) => {
    const body = schema.refine((b) => b.target === "missing-objective" || Boolean(b.id)).parse(await request.json());
    return NextResponse.json({ model: AI_EDIT_MODEL, estimates: await estimateAi(certId, body) });
  });
}
