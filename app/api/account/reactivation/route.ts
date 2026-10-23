import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";

export const dynamic = "force-dynamic";

const schema = z.object({ optOut: z.boolean() });

/** E-Mails „Schön, dass du da bist“ nach längerer Pause an- oder abschalten (Konto). */
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = schema.parse(await request.json());
    await getDb().update(users).set({ reactivationOptOut: body.optOut }).where(eq(users.id, user.id));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
