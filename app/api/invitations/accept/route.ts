import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { checkInvitationAcceptRateLimit } from "@/lib/server/auth-rate-limit";
import { acceptInvitation } from "@/lib/server/company/invitations";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(20).max(200) });

/** Nimmt eine Einladung an. Der angemeldete Nutzer muss genau die eingeladene E-Mail haben. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = checkInvitationAcceptRateLimit(user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Versuche. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });

  const result = await acceptInvitation({
    userId: user.id,
    userEmail: user.email,
    token: parsed.data.token,
  });

  if (result.ok) {
    return NextResponse.json({ organizationName: result.organizationName, role: result.role });
  }
  if (result.reason === "already_member") {
    return NextResponse.json({ error: "Du gehörst bereits zu einer Organisation." }, { status: 409 });
  }
  if (result.reason === "email_mismatch") {
    return NextResponse.json(
      { error: "Diese Einladung gilt für eine andere E-Mail-Adresse." },
      { status: 403 },
    );
  }
  return NextResponse.json({ error: "Einladung ungültig oder abgelaufen." }, { status: 404 });
}
