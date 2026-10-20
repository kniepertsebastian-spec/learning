import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { requireAdminApi } from "@/lib/server/auth-guards";
import type { SessionUser } from "@/lib/server/auth-guards";
import { EditConflictError, EditorNotFoundError, EditValidationError, editableCourse } from "./service";

const uuid = z.string().uuid();

/**
 * Gemeinsamer Rahmen der Werkstatt-Routen: nur Admins, nur allgemeine Kurse, IDs als UUID, und die Fehler des Service
 * als HTTP-Antwort (404 nicht gefunden, 409 inzwischen geändert, 422 ungültiger Inhalt, 400 kaputte Anfrage).
 */
export async function workshopRoute(
  params: Promise<Record<string, string>>,
  handler: (ctx: { certId: string; ids: Record<string, string>; user: SessionUser; audit: (action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) => Promise<void> }) => Promise<Response>,
): Promise<Response> {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const ids = await params;
  if (Object.values(ids).some((v) => !uuid.safeParse(v).success)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await editableCourse(ids.certId);
    const audit = (action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) =>
      recordAuditEvent({ actorUserId: guard.user.id, action, targetType, targetId, metadata: { certificationId: ids.certId, ...metadata } }).catch(() => {});
    return await handler({ certId: ids.certId, ids, user: guard.user, audit });
  } catch (error) {
    if (error instanceof EditorNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof EditConflictError) return NextResponse.json({ error: error.message, fingerprint: error.current }, { status: 409 });
    if (error instanceof EditValidationError) return NextResponse.json({ error: "Ungültiger Inhalt.", problems: error.problems }, { status: 422 });
    if (error instanceof ZodError) return NextResponse.json({ error: "Ungültige Anfrage.", problems: error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "Eingabe"}: ${i.message}`) }, { status: 422 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
