import { NextResponse } from "next/server";
import { forbidden, redirect } from "next/navigation";
import { auth } from "@/lib/server/auth";
import { getCurrentUser, type SessionUser } from "@/lib/server/auth-guards";
import { canReviewCourse } from "./service";

/** Seite für fachliche Prüfer: ohne Anmeldung zur Anmeldung, ohne Prüfer-Rolle 403. */
export async function requireReviewerPage(fromPath?: string): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect(fromPath ? `/login?from=${encodeURIComponent(fromPath)}` : "/login");
  const user = await getCurrentUser();
  if (!user || user.role !== "reviewer") forbidden();
  return user;
}

/** API-Route für einen zugewiesenen Kurs: 401 ohne Anmeldung, 403 ohne Prüfer-Rolle, 404 für jeden Kurs, der nicht zugewiesen oder nicht allgemein ist. */
export async function requireReviewerApi(certificationId: string): Promise<{ ok: true; user: SessionUser } | { ok: false; response: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const user = await getCurrentUser();
  if (!user || user.role !== "reviewer") return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  if (!(await canReviewCourse(user.id, certificationId))) return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { ok: true, user };
}
