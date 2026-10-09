import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getOwnPlan, PlanNotFoundError, studyWeeksFor } from "@/lib/server/exams/planner";
import { buildIcs } from "@/lib/exams/plan";

export const dynamic = "force-dynamic";

/** Kalenderdatei (.ics) des eigenen Prüfungstermins, optional mit wöchentlichen Lernblöcken (`?study=1`). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { plan, certName } = await getOwnPlan(user.id, id);
    if (!plan.scheduledAt) return NextResponse.json({ error: "Noch kein Termin eingetragen." }, { status: 409 });
    const now = new Date();
    const withStudy = new URL(request.url).searchParams.get("study") === "1";
    const studyWeeks = withStudy ? (await studyWeeksFor(user.id, plan.certificationId, plan.scheduledAt, plan.weeklyGoalHours, now)).weeks.filter((w) => w.kind === "learn" && w.plannedMinutes > 0 && !w.past).map((w) => ({ start: w.start, title: `Lernen: ${certName} (KW ${w.kw})`, minutes: w.plannedMinutes })) : [];
    const ics = buildIcs({ uidBase: plan.id, title: `Prüfung: ${certName}`, examAt: plan.scheduledAt, now, studyWeeks, location: plan.deliveryMode === "online" ? "Online mit Aufsicht" : plan.deliveryMode === "test_center" ? "Testcenter" : undefined });
    return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="pruefung-${plan.id.slice(0, 8)}.ics"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PlanNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
