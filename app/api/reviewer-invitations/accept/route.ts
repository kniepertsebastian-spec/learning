import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { auth } from "@/lib/server/auth";
import { acceptReviewerInvitation } from "@/lib/server/reviewers/service";

export const dynamic = "force-dynamic";

const schema = z.object({ token: z.string().min(10).max(200) });

/** Angemeldete Person nimmt eine Prüfer-Einladung an (die E-Mail muss genau zur Einladung passen). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { token } = schema.parse(await request.json());
    const result = await acceptReviewerInvitation(token, session.user.id);
    if (!result.ok) return NextResponse.json({ error: result.reason === "email_mismatch" ? "Diese Einladung gilt für eine andere E-Mail-Adresse." : "Die Einladung ist ungültig oder abgelaufen." }, { status: result.reason === "email_mismatch" ? 403 : 404 });
    return NextResponse.json({ courses: result.courses });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
