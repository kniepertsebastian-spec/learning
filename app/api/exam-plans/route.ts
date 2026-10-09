import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { EXAM_DELIVERY_MODES } from "@/lib/server/db/schema";
import { PlanError, PlanNotFoundError, savePlan } from "@/lib/server/exams/planner";

export const dynamic = "force-dynamic";

const planBody = z.object({
  certificationId: z.string().uuid(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  deliveryMode: z.enum(EXAM_DELIVERY_MODES).nullable().optional(),
  voucherExpiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  retakeIncluded: z.boolean().default(false),
  weeklyGoalHours: z.number().int().min(1).max(40).default(5),
});

/** Prüfungstermin eintragen oder den offenen Plan des Kurses ändern (eigener Plan, nie der einer anderen Person). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = planBody.parse(await request.json());
    const id = await savePlan({ id: user.id, role: user.role }, {
      certificationId: body.certificationId,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      deliveryMode: body.deliveryMode ?? null,
      voucherExpiresAt: body.voucherExpiresAt ? new Date(body.voucherExpiresAt) : null,
      retakeIncluded: body.retakeIncluded,
      weeklyGoalHours: body.weeklyGoalHours,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof PlanNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof PlanError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
