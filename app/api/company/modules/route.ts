import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkCompanyModuleRateLimit } from "@/lib/server/auth-rate-limit";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { requireCompanyApi } from "@/lib/server/company/guard";
import {
  createCompanyModule,
  InvalidDateError,
  InvalidModuleError,
  InvalidResponsibleError,
  listModulesForOrg,
  listResponsibleCandidates,
  MAX_MODULE_BODY,
  MAX_MODULE_TITLE,
  UnknownPathError,
} from "@/lib/server/company/modules";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  certificationId: z.string().uuid(),
  title: z.string().max(MAX_MODULE_TITLE + 100),
  body: z.string().max(MAX_MODULE_BODY + 100),
  validUntil: z.string().max(20),
  responsibleUserId: z.string().uuid().nullable().optional(),
});

/** Verwaltung (Mentor, Firmen-Admin): alle Module der eigenen Firma und wer verantwortlich sein kann. */
export async function GET() {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const orgId = guard.membership.organizationId;
  const [modules, responsible] = await Promise.all([listModulesForOrg(orgId), listResponsibleCandidates(orgId)]);
  return NextResponse.json({ modules, responsible }, { headers: { "Cache-Control": "no-store" } });
}

/** Legt ein Firmenmodul zu einem Lernpfad der Firma an. Ohne Angabe ist die anlegende Person verantwortlich. */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const limit = checkCompanyModuleRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zu viele Aktionen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    const created = await createCompanyModule({ organizationId: guard.membership.organizationId, userId: guard.membership.userId, ...body });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidModuleError) {
      return NextResponse.json({ error: `Titel mindestens 3 und höchstens ${MAX_MODULE_TITLE} Zeichen, Inhalt 1 bis ${MAX_MODULE_BODY} Zeichen.` }, { status: 400 });
    }
    if (error instanceof InvalidDateError) return NextResponse.json({ error: "„Gültig bis“ muss ein Datum von heute bis in höchstens 5 Jahren sein." }, { status: 400 });
    if (error instanceof InvalidResponsibleError) return NextResponse.json({ error: "Verantwortlich kann nur ein Mentor oder Firmen-Admin der Firma sein." }, { status: 400 });
    if (error instanceof UnknownPathError) return NextResponse.json({ error: "Lernpfad nicht gefunden." }, { status: 404 });
    throw error;
  }
}
