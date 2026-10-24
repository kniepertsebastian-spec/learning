import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { appUrl, isMailConfigured } from "@/lib/server/mail/config";
import { sendMail } from "@/lib/server/mail/mailer";
import { reviewerInvitationMessage } from "@/lib/server/mail/templates";
import { createReviewerInvitation, NotAGeneralCourseError } from "@/lib/server/reviewers/service";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email().max(200), certificationIds: z.array(z.string().uuid()).max(50) });

/** Betreiber: Prüfer per E-Mail einladen (mit den Kursen, die er nach Annahme bekommt). Ohne Mail-Versand kommt der Link in der Antwort. */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const body = schema.parse(await request.json());
    const { token } = await createReviewerInvitation({ email: body.email, certificationIds: body.certificationIds, createdByUserId: guard.user.id });
    const path = `/reviewer-invite/${token}`;
    const mailed = isMailConfigured() ? await sendMail(reviewerInvitationMessage(body.email, appUrl(path))) : false;
    return NextResponse.json({ mailed, link: mailed ? null : path }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    if (error instanceof NotAGeneralCourseError) return NextResponse.json({ error: "Prüfer lassen sich nur allgemeinen Kursen zuweisen, nie internen Lernpfaden einer Firma." }, { status: 400 });
    throw error;
  }
}
