import { NextResponse } from "next/server";
import { z } from "zod";
import { checkLoginRateLimit, clientIp } from "@/lib/server/auth-rate-limit";
import { SSO_COOKIE, SsoError, startSso } from "@/lib/server/sso/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Beginnt die Anmeldung über das Firmenkonto: findet die Firma zur E-Mail-Domain und liefert die Adresse des IdP. */
export async function POST(request: Request) {
  const body = z.object({ email: z.string().email().max(254) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, { status: 400 });
  if (!checkLoginRateLimit(clientIp(request.headers), body.data.email.toLowerCase()).allowed) {
    return NextResponse.json({ error: "Zu viele Versuche. Bitte später erneut versuchen." }, { status: 429 });
  }
  try {
    const { url, cookie } = await startSso(body.data.email);
    const response = NextResponse.json({ url });
    response.cookies.set(SSO_COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/sso", maxAge: 600 });
    return response;
  } catch (error) {
    if (error instanceof SsoError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
