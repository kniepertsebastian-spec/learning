import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { requireCourseEditorApi } from "@/lib/server/reviewers/guard";
import type { SessionUser } from "@/lib/server/auth-guards";
import { EditConflictError, EditorNotFoundError, EditValidationError, editableCourse } from "./service";

const uuid = z.string().uuid();

/**
 * Gemeinsamer Rahmen der Werkstatt-Routen: nur Admins (mit `reviewers: true` auch der dem Kurs zugewiesene Prüfer), nur allgemeine Kurse, IDs als UUID, und die Fehler des Service
 * als HTTP-Antwort (404 nicht gefunden, 409 inzwischen geändert, 422 ungültiger Inhalt, 400 kaputte Anfrage).
 */
export async function workshopRoute(
  params: Promise<Record<string, string>>,
  handler: (ctx: { certId: string; ids: Record<string, string>; user: SessionUser; audit: (action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) => Promise<void> }) => Promise<Response>,
  options: { reviewers?: boolean } = {},
): Promise<Response> {
  const ids = await params;
  const validIds = Object.values(ids).every((v) => uuid.safeParse(v).success);
  // Prüfer dürfen nur die manuelle Bearbeitung ihres Kurses (kein KI-Zugriff, keine Kursverwaltung): nur Routen mit `reviewers: true`.
  const guard = options.reviewers && validIds ? await requireCourseEditorApi(ids.certId) : await requireAdminApi();
  if (!guard.ok) return guard.response;
  if (!validIds) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
