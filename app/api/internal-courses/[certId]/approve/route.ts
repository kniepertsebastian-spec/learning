import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import { approveInternalCourse } from "@/lib/server/internal-courses/service";

export const dynamic = "force-dynamic";

/**
 * Die Firma gibt ihren KI-Entwurf frei, nachdem Mentor oder Firmen-Admin ihn geprüft hat. Name und Datum werden am
 * Lernpfad gespeichert; erst danach sehen ihn Lernende und kann er zugewiesen werden.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireCompanyApi(["company_admin", "mentor"]);
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(certId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [user] = await getDb().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, guard.membership.userId)).limit(1);
  const ok = await approveInternalCourse(guard.membership.organizationId, certId, {
    id: guard.membership.userId,
    name: user?.name?.trim() || user?.email || "Unbekannt",
  });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
