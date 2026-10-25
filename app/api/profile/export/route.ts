import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getMailConfig } from "@/lib/server/mail/config";
import { renderLearningProfilePdf } from "@/lib/server/profile-export/pdf";
import { issueLearningProfile, listEligibleCourses, listIssuedProfiles, MissingNameError, NothingToExportError } from "@/lib/server/profile-export/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: Kurse, die ins PDF kommen würden, und die bisher ausgestellten PDFs. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [courses, issued] = await Promise.all([listEligibleCourses(user.id), listIssuedProfiles(user.id)]);
  return NextResponse.json({ courses, issued }, { headers: { "Cache-Control": "no-store" } });
}

/** POST: stellt ein signiertes Lernprofil aus und liefert es als PDF. Nur Kurse mit hinterlegter, bestandener Zertifikatsprüfung. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const issued = await issueLearningProfile(user.id);
    const base = getMailConfig()?.baseUrl ?? new URL(request.url).origin;
    const pdf = await renderLearningProfilePdf({ ...issued, verifyUrl: `${base}/verify/${issued.id}` });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lernprofil-${issued.id.slice(0, 8)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof NothingToExportError) return NextResponse.json({ error: "Für den Nachweis braucht es mindestens einen Kurs mit hinterlegter, bestandener Zertifikatsprüfung." }, { status: 409 });
    if (error instanceof MissingNameError) return NextResponse.json({ error: "Bitte trage zuerst deinen Namen im Konto ein: Er steht im Nachweis." }, { status: 409 });
    throw error;
  }
}
