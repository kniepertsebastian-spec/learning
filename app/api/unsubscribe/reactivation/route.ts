import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import { verifyUnsubscribeToken } from "@/lib/server/reactivation/token";

export const dynamic = "force-dynamic";

const schema = z.object({ u: z.string().uuid(), t: z.string().min(10).max(200) });

/** Abmeldung von den Reaktivierungs-Mails über den Link in der Mail (ohne Anmeldung, signiertes Token). */
export async function POST(request: Request) {
  try {
    const { u, t } = schema.parse(await request.json());
    if (!verifyUnsubscribeToken(u, t)) return NextResponse.json({ error: "Ungültiger Link." }, { status: 400 });
    await getDb().update(users).set({ reactivationOptOut: true }).where(eq(users.id, u));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
