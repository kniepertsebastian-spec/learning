import { NextResponse } from "next/server";
import { STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { listSharedPlannedExams } from "@/lib/server/company/certificates";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { buildIcs } from "@/lib/exams/plan";

export const dynamic = "force-dynamic";

/** Teamkalender: nur die von den Personen freigegebenen Prüfungstermine (.ics). */
export async function GET() {
  const guard = await requireCompanyApi(STATUS_VIEW_ROLES);
  if (!guard.ok) return guard.response;
  const now = new Date();
  const planned = await listSharedPlannedExams(guard.membership.organizationId, now);
  const events = planned.map((p) => buildIcs({ uidBase: p.id, title: `Prüfung: ${p.certification} (${p.memberName ?? p.memberEmail})`, examAt: p.scheduledAt, now }));
  // Mehrere Kalender zu einem zusammenfassen: Rahmen des ersten, VEVENTs aller.
  const body = events.length === 0 ? buildIcs({ uidBase: "leer", title: "Keine freigegebenen Termine", examAt: now, now }).replace(/BEGIN:VEVENT[\s\S]*END:VEVENT\r\n/, "") : events[0].replace("END:VCALENDAR\r\n", "") + events.slice(1).map((e) => e.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT\r\n/)?.[0] ?? "").join("") + "END:VCALENDAR\r\n";
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="team-pruefungen.ics"', "Cache-Control": "no-store" } });
}
