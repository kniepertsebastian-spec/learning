import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkCompanyModuleRateLimit } from "@/lib/server/auth-rate-limit";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { requireCompanyApi } from "@/lib/server/company/guard";
import {
  archiveCompanyModule,
  InvalidDateError,
  InvalidModuleError,
  InvalidResponsibleError,
  MAX_MODULE_BODY,
  MAX_MODULE_TITLE,
  ModuleNotFoundError,
  updateCompanyModule,
} from "@/lib/server/company/modules";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const patchSchema = z
  .object({
    title: z.string().max(MAX_MODULE_TITLE + 100).optional(),
    body: z.string().max(MAX_MODULE_BODY + 100).optional(),
    validUntil: z.string().max(20).optional(),
    responsibleUserId: z.string().uuid().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);

/** Ändert ein Modul der eigenen Firma; nur „validUntil“ allein ist das Verlängern. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = checkCompanyModuleRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zu viele Aktionen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  let patch: z.infer<typeof patchSchema>;
  try {
    patch = patchSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    await updateCompanyModule({ organizationId: guard.membership.organizationId, userId: guard.membership.userId, moduleId: id, patch });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ModuleNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof InvalidModuleError) {
      return NextResponse.json({ error: `Titel mindestens 3 und höchstens ${MAX_MODULE_TITLE} Zeichen, Inhalt 1 bis ${MAX_MODULE_BODY} Zeichen.` }, { status: 400 });
    }
    if (error instanceof InvalidDateError) return NextResponse.json({ error: "„Gültig bis“ muss ein Datum von heute bis in höchstens 5 Jahren sein." }, { status: 400 });
    if (error instanceof InvalidResponsibleError) return NextResponse.json({ error: "Verantwortlich kann nur ein Mentor oder Firmen-Admin der Firma sein." }, { status: 400 });
    throw error;
  }
}

/** Archiviert ein Modul der eigenen Firma. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await archiveCompanyModule(guard.membership.organizationId, id, guard.membership.userId);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
