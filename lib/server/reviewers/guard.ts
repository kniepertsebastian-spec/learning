import { NextResponse } from "next/server";
import { forbidden, redirect } from "next/navigation";
import { auth } from "@/lib/server/auth";
import { getCurrentUser, type SessionUser } from "@/lib/server/auth-guards";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getCompanyMembership, isRoleAllowed } from "@/lib/server/company/access";
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

/** Darf diese Person (Firmen-Admin oder Mentor) den internen Kurs ihrer eigenen Firma von Hand bearbeiten? Die Firma kommt aus der Mitgliedschaft. */
export async function canEditInternalCourse(userId: string, certificationId: string): Promise<string | null> {
  const membership = await getCompanyMembership(userId);
  if (!isRoleAllowed(membership, ["company_admin", "mentor"])) return null;
  const [cert] = await getDb().select({ kind: certifications.kind, owner: certifications.ownerOrganizationId }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
  return cert?.kind === "internal" && cert.owner === membership.organizationId ? membership.organizationId : null;
}

/**
 * Werkstatt-Route eines Kurses: Admins immer (allgemeine Kurse), Prüfer nur im ihnen zugewiesenen allgemeinen Kurs (Rollenmodell 1:1),
 * Firmen-Admins und Mentoren nur in den internen Kursen ihrer eigenen Firma (`organizationId` gesetzt). 401 ohne Anmeldung,
 * 403 für alle anderen Rollen, 404 für einen Kurs, der der Person nicht zugewiesen ist oder einer anderen Firma gehört.
 */
export async function requireCourseEditorApi(certificationId: string): Promise<{ ok: true; user: SessionUser; organizationId?: string } | { ok: false; response: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.role === "admin") return { ok: true, user };
  if (user.role === "reviewer") {
    if (!(await canReviewCourse(user.id, certificationId))) return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
    return { ok: true, user };
  }
  const membership = await getCompanyMembership(user.id);
  if (!isRoleAllowed(membership, ["company_admin", "mentor"])) return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const organizationId = await canEditInternalCourse(user.id, certificationId);
  if (!organizationId) return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { ok: true, user, organizationId };
}

/** API-Route für das eigene Expertenprofil: 401 ohne Anmeldung, 403 ohne Prüfer-Rolle. */
export async function requireReviewerUserApi(): Promise<{ ok: true; user: SessionUser } | { ok: false; response: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const user = await getCurrentUser();
  if (!user || user.role !== "reviewer") return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, user };
}
