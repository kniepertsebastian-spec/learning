import { NextResponse } from "next/server";
import { STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { buildAuditPdf } from "@/lib/server/company/audit-pdf";
import { buildAuditExport } from "@/lib/server/company/certificates";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Audit-Export (CSV oder PDF): nur von den Personen freigegebene Zertifikate und der Pflichtschulungs-Status; der Export wird protokolliert. */
export async function GET(request: Request) {
  const guard = await requireCompanyApi(STATUS_VIEW_ROLES);
  if (!guard.ok) return guard.response;
  const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const [actor] = await getDb().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, guard.membership.userId)).limit(1);
  const exported = await buildAuditExport({ organizationId: guard.membership.organizationId, organizationName: guard.membership.organizationName, actorUserId: guard.membership.userId, actorName: actor?.name ?? actor?.email ?? "" });
  const stamp = exported.meta.createdAt.slice(0, 10);
  if (format === "pdf") {
    const bytes = await buildAuditPdf(exported);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="zertifikats-register-${stamp}.pdf"`, "Cache-Control": "no-store" } });
  }
  return new NextResponse("﻿" + exported.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="zertifikats-register-${stamp}.csv"`, "Cache-Control": "no-store" } });
}
