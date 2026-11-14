import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getSelfReportSettings, listSelfReports, recordSelfReport } from "@/lib/server/self-reports/service";
import { SELF_REPORT_KINDS, SELF_REPORT_REF_TYPES } from "@/lib/self-reports";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(SELF_REPORT_KINDS),
  /** null = übersprungen; der erlaubte Wert hängt von der Art ab (lib/self-reports.ts). */
  value: z.union([z.string().max(40), z.number(), z.null()]),
  refType: z.enum(SELF_REPORT_REF_TYPES).nullish(),
  refId: z.string().uuid().nullish(),
  sessionId: z.string().uuid().nullish(),
});

const REFUSED = {
  invalid_value: 400,
  session_not_found: 404,
  flag_off: 409,
  disabled: 409,
  paused: 409,
  session_limit: 409,
} as const;

/** Eigene Einstellungen je Art und die letzten Selbstauskünfte (Aufgabe 17). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [settings, reports] = await Promise.all([getSelfReportSettings(user.id), listSelfReports(user.id)]);
  return NextResponse.json({ settings, reports });
}

/** Eine Selbstauskunft speichern oder als übersprungen vermerken (Aufgabe 17). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const result = await recordSelfReport(user.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: REFUSED[result.reason] });
  return NextResponse.json(result);
}
