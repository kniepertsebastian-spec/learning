import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkAiSettingsRateLimit } from "@/lib/server/auth-rate-limit";
import {
  EncryptionUnavailableError,
  getAiSettings,
  InvalidKeyError,
  KeyCheckUnavailableError,
  KeyRequiredError,
  setAiSettings,
} from "@/lib/server/company/ai-settings";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

// Nur der Firmen-Admin: der KI-Zugang betrifft Kosten und Daten der ganzen Firma.
const ADMIN_ONLY = ["company_admin"] as const;

const putSchema = z.object({
  mode: z.enum(["platform", "byok"]),
  apiKey: z.string().max(300).nullable().optional(),
});

/** KI-Zugang der eigenen Firma. Nie der Schlüssel, nur ob einer da ist und seine letzten 4 Zeichen. */
export async function GET() {
  const guard = await requireCompanyApi(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  const settings = await getAiSettings(guard.membership.organizationId);
  return NextResponse.json(settings, { headers: { "Cache-Control": "no-store" } });
}

/** Setzt den Modus (unser Zugang oder eigener Schlüssel) und optional einen neuen Schlüssel, der vor dem Speichern geprüft wird. */
export async function PUT(request: Request) {
  const guard = await requireCompanyApi(ADMIN_ONLY);
  if (!guard.ok) return guard.response;

  const limit = checkAiSettingsRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Änderungen. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: z.infer<typeof putSchema>;
  try {
    body = putSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }

  try {
    const settings = await setAiSettings({
      organizationId: guard.membership.organizationId,
      actorUserId: guard.membership.userId,
      mode: body.mode,
      apiKey: body.apiKey,
    });
    return NextResponse.json(settings, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EncryptionUnavailableError) {
      return NextResponse.json({ error: "Eigene Schlüssel lassen sich auf diesem Server noch nicht speichern (APP_ENCRYPTION_KEY fehlt)." }, { status: 503 });
    }
    if (error instanceof InvalidKeyError) return NextResponse.json({ error: "Der Schlüssel ist ungültig oder gesperrt." }, { status: 400 });
    if (error instanceof KeyCheckUnavailableError) {
      return NextResponse.json({ error: "Der Schlüssel konnte gerade nicht geprüft werden (Google nicht erreichbar). Bitte später erneut versuchen." }, { status: 502 });
    }
    if (error instanceof KeyRequiredError) return NextResponse.json({ error: "Für „eigener Schlüssel“ wird ein Schlüssel gebraucht." }, { status: 400 });
    throw error;
  }
}
