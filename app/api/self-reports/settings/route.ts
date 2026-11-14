import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { setSelfReportEnabled } from "@/lib/server/self-reports/service";
import { SELF_REPORT_KINDS } from "@/lib/self-reports";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ kind: z.enum(SELF_REPORT_KINDS), enabled: z.boolean() });

/** Eine Art von Selbstauskunft an- oder abschalten („Wie ich lerne“, Aufgabe 17). */
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  await setSelfReportEnabled(user.id, parsed.data.kind, parsed.data.enabled);
  return new NextResponse(null, { status: 204 });
}
